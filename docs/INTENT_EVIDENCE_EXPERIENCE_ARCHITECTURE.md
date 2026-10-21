# Intent → Evidence → Experience

Status: foundation v0.1, built 2026-10-21 on `feature/intent-evidence-experience`, stacked on PR #14 (Control Plane v1) and on `feature/retention-first-portal`.

## Product contract

A physician states a professional intent once. The system chooses the sources, tools and domain capabilities, runs them, validates the evidence, and compiles the result into one consistent interactive experience. The physician never picks an agent, a website, a model or a specialty agent. The physician owns the intent, and the system owns execution.

```
Intent → Execution Plan → Capability/Source Mesh → Evidence Graph → ExperienceManifest → Renderer
```

The visible product is unchanged: one input, followed by a result page. The page is now compiled from a manifest.

## Four separate concepts

| Concept | What it is | Where |
| --- | --- | --- |
| JOB | What the physician wants done. There are 12 fine-grained job types (`guideline_check`, `drug_reference`, `inn_lookup`, …), each with evidence requirements. The portal families (`answer`, `drug`, `guidelines`, …) remain the physician-facing vocabulary. | `lib/mesh/jobs.ts` |
| CAPABILITY | What the system knows how to do. There are six capabilities, and each states why it exists separately. `evidence_answer` runs on the source mesh; the others wrap existing executors. A capability's `host` is only the persistence partition. | `lib/mesh/capabilities.ts` |
| SOURCE | Where evidence, data and actions come from. Each source has a typed descriptor and a runtime adapter. | `lib/mesh/sources.ts`, `server/mesh/sources/*` |
| EXPERIENCE | How the result is represented, using a bounded manifest of approved module families. | `lib/mesh/manifest.ts`, `lib/mesh/compiler.ts`, `components/experience/experience-view.tsx` |

`PortalJobDefinition` no longer names an agent. `routePortalIntent` takes the host from the capability registry.

## Pipeline as implemented

1. **Intent compiler** (`lib/mesh/intent.ts`). Deterministic, with no model involved. It combines three inputs:
   - the portal router (family);
   - the lexicon (drugs, concepts, populations);
   - the Domain Skill Graph (nosology, subtype, scenario).

   The output is a `NormalizedIntent` containing the job type, context, entities, required and optional evidence requirements, safety rules and preferred modules. The supervisor recompiles the intent from the risk-sanitized text, so nothing the risk gate redacted reaches a source.
2. **SourcePlanner** (`lib/mesh/planner.ts`). For each requirement it picks the fewest sources that can meet it:
   - one primary;
   - at most one fallback, which runs only if the primary is empty or fails;
   - stand-ins (the US label stands in for the Russian instruction, and says so);
   - official hand-offs, which are never executed.

   Sources are rejected with a stated reason: wrong specialty, unavailable, excluded by the physician, missing entities, redundant, or over budget (6 invocations). One invocation may cover several requirements (`alsoCovers`).
3. **Execution** (`server/mesh/execute.ts`). Primaries run in parallel and fallbacks run only when needed. Each step has a 45 s timeout. Every step ends in a recorded invocation.
4. **Source adapters** (`server/mesh/sources/*`). They return normalized `Document → Version → SemanticChunk → Entity → Claim` records and nothing else.
5. **Evidence Graph v0.1** (`lib/mesh/evidence-graph.ts`):
   - every claim is traceable to a document, chunk and source;
   - conflicts are preserved, never resolved;
   - freshness (`live`, `snapshot`, `revision_overdue`, `needs_reverification`) and requirement coverage are explicit.
6. **Experience Compiler** (`lib/mesh/compiler.ts`) maps `graph + user context + job + scenario` to an `ExperienceManifest`. It is deterministic. The output is validated by zod and by the policy gates. If either fails, the compiler falls back to a safe answer that withholds the flagged excerpts and says so.
7. **Renderer** (`components/experience/experience-view.tsx`). Each module family maps to existing approved components and CSS (`pt-*`, `ws-*`). Every visible statement is resolved from the graph by id. Old runs without a manifest still render through `JobResult`.

Runs persist `{ manifest, graph, plan summary }` in the run payload (PostgreSQL JSONB, or memory). Compiled experiences of the same scenario are reused for 6 h from the knowledge store.

## SourceAdapter registry

| Source | Authority | Execution | Provides | Specialties | Status today |
| --- | --- | --- | --- | --- | --- |
| `medi` (medi.ru) | professional | browser (HTTP fallback) | Russian instruction, INN listing, Russian guideline copy, articles (hand-off) | all | LIVE with Chromium, LIMITED over HTTP |
| `pubmed` | primary | api | current research, international guidelines | all | LIVE |
| `openfda` | official (US) | api | drug label | all | LIVE (stand-in for the Russian instruction) |
| `goldenset_catalog` | professional | snapshot | Russian guideline (RKO, with currentness) | cardiology | SNAPSHOT |
| `esc_guidelines_snapshot` | secondary | snapshot | specialty society guideline | cardiology | SNAPSHOT |
| `regulatory_snapshot` | secondary | snapshot | drug safety signals | cardiology | SNAPSHOT |
| `minzdrav_rubricator` | official | manual hand-off | official guideline status | all | HANDOFF |
| `grls` | official | manual hand-off | official drug registration | all | HANDOFF |

Each descriptor declares the following: `domains`, `specialties`, `jobs`, `provides`, `operations`, `authority`, `execution`, `freshnessPolicy`, `cachePolicy`, `usagePolicy` (robots, terms, audience, reuse, excerpt limit, attribution, rate, agreement, jurisdiction, open questions), `cost` and `handoffUrl`.

## BrowserSourceTool (generic)

`server/mesh/browser/tool.ts` provides `open → search → interact → extract → normalize → provenance`. A site adapter supplies data only:
- an entry URL;
- an interaction recipe;
- semantic targets;
- a normalizer;
- an output schema.

The tool enforces the following:
- **robots.txt**: the recorded snapshot is the floor. A live re-read at most once a day can only add rules.
- **Allowed path prefixes** per site.
- **Politeness**: a per-host interval.
- **Budget**: a page budget per invocation.
- **Cache**: page cache (bypassed by re-verification).
- **Provenance**: every visit is recorded with its driver.

Drivers are `playwright` (real Chromium) and `http`. Extraction always runs on the same DOM parser (linkedom 0.18.12), so a recipe behaves identically under both drivers and can be tested on fixtures. When the browser path hits a gateway error, the same recipe is retried over HTTP and the invocation is reported as `LIMITED`/`http`.

Failure codes are explicit: `layout_changed:<extractor>:<target>`, `robots_disallow:<rule>`, `network`, `http_error:<status>`, `timeout`, `not_found`, `driver_unavailable`, `page_budget_exceeded`. A failed source never becomes a result.

## MEDI adapter — state

- **Execution path.** Robots-allowed entry pages only. MEDI's own `/search` and `/autoload/` are disallowed for all agents and are never automated.
  - `drug_reference`: `/analogi-mnn/<inn>/` → choose the mono-component product → `/instrukciya/<slug>_<id>/`. Sections are read by heading text plus schema.org `itemprop`. Indications are split by their bold sub-headings, and coverage is detected: «независимо от фракции выброса» covers every HF subtype.
  - `inn_lookup`: the same listing (products with this INN).
  - `guideline_discovery` and `disease_reference`: the specialty catalogue `/filters/doc_type/manuals/<slug>/` (up to 3 pages) → title match from the domain graph (adult, children and pregnancy wording respected) → the guideline page.
  - From the guideline page the adapter extracts:
    - `#cr_*` metadata (ID, year, review cycle, ICD-10, associations, approval and agreement lines);
    - section chunks (own text only, fingerprinted);
    - the subtype section statement;
    - drug mentions or an absence check;
    - currentness: revision overdue by the document's own cycle.
  - `professional_article_search`: an honest hand-off, because it needs `/search`.
- **Labelling.** Everything is labelled as a secondary copy: verification is at most «частично подтверждено» with «сверьте в ГРЛС» or «сверьте в рубрикаторе». Excerpts are at most 700 characters and the page URL is always kept. Sections not used by a claim keep only their fingerprint, so no page copy is stored.
- **Exercised live on 2026-10-21** with both drivers:
  - Джардинс (ЛП-002735) and the HF indication «независимо от фракции выброса»;
  - КР156 «Хроническая сердечная недостаточность» (2016, пересмотр каждые 3 года) with section 3.1.11 on ХСН-сФВ;
  - the absence of empagliflozin in that document.
- **Observed failure modes, all handled explicitly:** connection resets, and intermittent 502s on the 590 KB guideline page. These are retried once, then degraded to HTTP, otherwise reported as a gap.

## Domain Skill Graph

`lib/mesh/domain-graph.ts` is organised as `SPECIALTY → NOSOLOGY → SUBTYPE → SCENARIO`. v0.1 covers:
- 12 nosologies across the six launch specialties;
- 3 heart-failure subtypes;
- 8 scenarios.

Each node carries:
- **Interpretation:** Russian patterns, abbreviations, ICD-10.
- **Source selection:** a PubMed term, guideline title words, and scenario requirements (e.g. cardiology HF `guideline_check` requires a specialty society guideline and the official status hand-off).
- **Safety:** `currentness_must_be_shown`, `pediatric_sections`, `pregnancy_sections`, `jurisdiction_boundary`, `no_prescribing`.
- **Ranking:** English ranking terms, subtype words.
- **Modules:** the preferred module order per scenario.

It adds no executor. Taxonomy is not agent count.

## Evidence Graph v0.1 schema

`lib/mesh/evidence.ts` defines:
- `EvidenceGraph { schema, id, job, family, specialty, context { nosology, subtype, drugs, terms } }`;
- `sources[]` (status, execution, outcome, hand-off URL, requirement);
- `documents[]`, `versions[]` and `chunks[]` (only chunks that keep text or back a claim);
- `entities[]`;
- `claims[]` (kind, statement, quote, language, polarity, covers, method `verbatim | metadata | rule_derived | absence_check`, extraction confidence, verification);
- `relations[]`: `supported_by`, `about`, `conflicts_with` (candidate), `not_mentioned_in` (candidate), `listed_in`;
- `conflicts[]` (`polarity | temporal_divergence | jurisdiction`, explanation from metadata only, always `unresolved`);
- `freshness[]`;
- `confidence { extractionMin, extractionMean, coverage }`;
- `gaps[]` (physician language).

## ExperienceManifest v0.1 schema

`lib/mesh/manifest.ts` (zod) defines:
- `schema`, `id`, `graphId`;
- `intent { job, family, specialty, nosology, subtype, scenario }`;
- `representation { density: compact | standard | detailed, mode: professional_answer | drug_card | guideline_delta | evidence_comparison | event_list | learning_step | source_list | safe_answer }`;
- `modules[]` (family, approved title, emphasis, collapsed, `claimIds`, `documentIds`, `resultKeys`, short props);
- `actions[]` (`open_source | compare_versions | investigate_deeper | save | follow_up | verify_official`);
- `personalization` (real signals only);
- `stableShell: "portal-shell/1"`;
- `provenance`;
- `compiler { version, fallback, warnings, decisions, policy }`.

Module families are listed below. `comparison`, `timeline` and `calculator` are declared but not implemented, so the compiler cannot select them.

| Family | Implemented |
| --- | --- |
| `key_takeaway` | yes |
| `recommendation_delta` | yes |
| `conflict` | yes |
| `drug_reference` | yes |
| `evidence` | yes |
| `sources` | yes |
| `event_list` | yes |
| `learning_next_step` | yes |
| `handoff` | yes |
| `next_actions` | yes |
| `notices` | yes |
| `partner` | yes |
| `comparison` | no |
| `timeline` | no |
| `calculator` | no |

`lib/mesh/projection.ts` projects a runtime manifest onto the Control Plane's `ExperienceManifest`, so `evaluateManifestAgainstChange` judges what users actually receive.

## Policy gates

All gates are in `lib/mesh/policies.ts`. They are executable, return structured fix suggestions, and never mutate anything.

| Policy | Rules |
| --- | --- |
| DesignSystemPolicy | approved family, approved title, per-family limit, module budget |
| EditorialPolicy | no implementation vocabulary, no directive wording, sentence case, short labels, partner disclosure |
| EvidencePolicy | no invented claims or documents, provenance, no unsupported claims anywhere, modules need evidence, conflicts must be shown |
| ExperiencePolicy | stable shell, takeaway first, partner never first, next actions last, sources after content, job drift, real signals only, currentness visible, jurisdiction boundary |
| SourcePolicy | sources used are listed, nothing from failed sources, excerpt limit, specialty boundary, attribution |

A blocking candidate falls back to the safe answer (`experience_fallback_used`). Its fix suggestions become a proposed Change (`changeFromPolicyFindings`). This happened for real during verification: PubMed quotes exceeded the 600-character policy, the gate caught it, and the adapter was fixed.

## Versioned knowledge and incremental invalidation

`server/mesh/knowledge.ts` implements the chain `Source → Document → Version → SemanticChunk → Entity → Claim → Scenario → Experience`.

- **Re-verification** re-reads one document (`adapter.fetch`, cache bypassed).
- **Unchanged fingerprint:** nothing happens. TTL expiry means «re-check», never «changed».
- **Changed fingerprint:**
  1. The changed, added and removed chunks are identified.
  2. Claims are re-extracted only for the scenarios that depend on the document, reading the same fresh page.
  3. Only scenarios whose claims actually moved are marked stale.
  4. Only those are recompiled.
  5. A change in a section no scenario uses updates the version and invalidates nothing.

The fixture test (`tests/unit/mesh-incremental.test.ts`) uses MEDI-like v1 → v2 pages where only section 3.1.11 changed. Results:
- 1 document re-read and 1 of 4 chunks changed;
- the HFpEF statement and the «not mentioned» observation were recomputed;
- the cardiology and therapy scenarios went stale, while the hypertension and migraine scenarios were untouched;
- 2 of 4 experiences were recompiled; the corpus was not rebuilt;
- in the regenerated cardiology manifest the conflict module disappeared, because the guideline now agrees.

The delta became a Change classified R4/E2. The `module_family` negative obligation was violated, so the release decision is `BLOCK`.

## Change integration

`control-plane/lib/model.ts` adds:
- `ChangeCause`: `code | source_delta | policy_delta | ranking_delta | experience_delta | taxonomy_delta`;
- `KnowledgeDelta`, `CapabilityDelta`, `ExperienceDelta`, `ImplementationDelta`;
- positive `changes`;
- negative obligations `does_not_change { module_family, navigation, user_job, source_policy, onboarding, representation, ranking, safety_thresholds }`.

Other control-plane changes:
- `control-plane/lib/obligations.ts` checks the obligations against experience samples before and after, and reports contradictions.
- `classifyRisk` derives R* triggers from knowledge deltas: claims moved → `medical_evidence` (R4); guideline statements → `clinical_recommendation`; contraindications → `drug_safety`.
- It derives E* triggers from experience deltas: module-set or order change → E2; representation change → E2; content-only refresh → the new E1 trigger `source_content_refresh`.
- Declared obligations add the required gate `negative_obligations`.
- Release requirements stay the union of both axes, and the rollout ceiling stays the minimum.

`server/mesh/changes.ts` creates source-delta Changes and policy-fix Changes, then evaluates them with the existing `decideRelease`. The system records, evaluates and recommends; it never applies.

## Observability

These events go to the same ring and `analytics_events` table as the retention events. Payloads carry ids, categories, counts and timings only. Verified in PostgreSQL: no query text.

- `source_plan_created`
- `source_invoked`
- `source_failed`
- `evidence_graph_built`
- `experience_manifest_compiled`
- `experience_fallback_used`
- `source_delta_detected`
- `change_created`
- `change_evaluated`

The retention instrumentation is unchanged. `intent_routed` now also carries `capability` and `jobType`.

## Source-policy and licensing questions (open)

1. **MEDI agreement.** Automated reading of MEDI is a technical possibility, not a contract. Is an agreement with the МЕДИ РУ editorial team needed for automated reading and for showing short attributed excerpts?
2. **Unverified viewers.** MEDI states its content is for healthcare professionals only. The portal has no physician verification yet. May excerpts be shown to anonymous sessions?
3. **Fingerprint storage.** Is storing section fingerprints and ≤700-character excerpts for change tracking acceptable? No page copy is stored.
4. **Physician validation.** medi.ru is not in the physicians' source-validation sheet (`data/source-validation-b2d.json`), so it is labelled «вторичный источник» and capped at «частично подтверждено». The medical trainers need to decide.
5. **Outdated guideline copy.** MEDI's copy of the HF guideline is КР156 (2016). The product says the revision is overdue by the document's own cycle, but cannot name the current version until the Minzdrav rubricator (`cr.minzdrav.gov.ru`) has an official data channel.
6. **ГРЛС.** The registry is still a hand-off. An official data channel is required before any registration status is asserted.
7. **ESC summaries.** The ESC snapshot quotes a secondary summary (AJMC). Using the primary guideline text needs ESC/OUP permissions.
8. **openFDA quota.** openFDA allows 1,000 requests per day without a key (`OPENFDA_API_KEY`).

## Not built (by design for v0.1)

- No universal crawler and no MEDI import.
- No model in the loop.
- No other browser sites.
- The knowledge store is per process (cache, not source of truth). A PostgreSQL-backed `KnowledgeStore` and a scheduled re-verification job are the next steps.
- No `comparison`, `timeline` or `calculator` renderers.
- Event, learning, updates, research and materials jobs still run their existing executors and render through `JobResult`. They can move to manifests family by family.
