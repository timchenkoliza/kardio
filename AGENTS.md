# KARDIO — repository execution rules

## Product boundary

KARDIO is a professional knowledge, evidence, source, tool and navigation environment for physicians.

The active product has no access to patient data, EHR/EMR/MIS, appointment schedules, encounter context, active patient state, patient-specific labs/imaging/ECG, prescriptions/orders, or patient-specific tasks/alerts/prioritization. Historical repository artifacts containing those concepts are legacy only and must not leak into active code, schemas, fixtures, UI, or product copy.

## Authority

Use this priority order:

1. explicit instructions in the current task;
2. `context/42_RETENTION_FIRST_PORTAL.md` for product direction and information architecture (retention-first professional portal, six launch specialties);
3. `docs/PRODUCT_OPPORTUNITY_MAP.md` for homepage prominence decisions;
4. `context/00_START_HERE.md`;
5. `context/16_V3_SOURCE_OF_TRUTH_AUDIT.md`;
6. `context/22_FULLSTACK_PRODUCT_REBUILD.md`;
7. `context/23_APP_ONTOLOGY_V1.md` once present;
8. other current v3 files;
9. existing implementation;
10. external technical references.

`context/40_AGENT_FIRST_WORKSPACE.md` is historical: its safety gates and honesty rules still apply, its agent-first IA does not.

`context/21_VISUAL_RESET_V2.md` is authoritative for visual direction, not application architecture. Other repositories/projects are not product truth.

## Canonical data

The Cardiology Golden Set contains 54 canonical objects, 18 canonical sources and a 24-object evaluation slice. Treat it as immutable migration evidence. Preserve original IDs, source IDs, URLs, raw records, provenance, currentness, version relationships and rights uncertainty.

There is no approved canonical Oncology dataset yet. Never use Cardiology as Oncology fallback and never fabricate Oncology clinical content.

The same rule covers every launch specialty without a canonical dataset (therapy, pediatrics, obgyn, neurology, endocrinology): they are served by live sources (PubMed, openFDA) and honest hand-offs, never by Cardiology catalog objects, snapshots or partner fixtures.

## Architecture

Use ontology-first architecture:

`world ontology → evidence + states + events → graph relations → search/ranking/UI projections → ingestion adapters → UI`

Do not design the domain as `source export → cards` or `database rows → React components`.

Use PostgreSQL + Drizzle with relational persistence and graph semantics. Do not introduce Neo4j without a demonstrated requirement.

Keep the professional world graph separate from user state. Saves, pins, follows, recent activity, collections, selected specialty and selected shell reference ontology node IDs but are not professional-knowledge nodes.

## State and evidence

Do not use one overloaded `status`. Keep currentness, editorial state, rights state, availability, source standing and semantic media match independent.

`archive != superseded`. Do not infer `superseded` solely from a newer-looking relation, and do not infer `current` solely because no superseding object is known. Currentness remains evidence-backed.

Model confidence means extraction/matching confidence, never probability that a medical statement is true.

TTL means re-verification is required: `verified → needs_reverification`, never `verified → false`. Preserve evidence history.

## Media

Semantic relevance and usage rights are independent. A semantically exact asset can still be product-ineligible. Centralize product-media eligibility in one domain policy. Unknown/restricted/prototype-only media must not render on production-eligible surfaces. Image-free rendering is first-class.

Google Drive is a raw ingestion archive, not a production CDN. Do not hardcode Drive media URLs into canonical content objects.

## Identity and AI

Ontology identities must be deterministic and stable. Preserve canonical/original IDs where safe; generated identities must use deterministic namespacing. Do not use random identities for canonical imported entities.

AI may assist extraction, tagging, classification, entity linking, query understanding and candidate relation generation. AI must not manufacture clinical authority, missing medical facts, canonical Oncology knowledge or patient context. Model-derived edges remain candidates until explicitly promoted under policy.

## Intent → evidence → experience

The durable contract: a physician states a professional intent once; the system chooses sources and capabilities, executes them, validates evidence and compiles one consistent result. Keep four concepts separate: JOB (`lib/mesh/jobs.ts`), CAPABILITY (`lib/mesh/capabilities.ts`), SOURCE (`lib/mesh/sources.ts`, `server/mesh/sources`), EXPERIENCE (`lib/mesh/manifest.ts`). The pipeline is `compileIntent → planSources → executePlan → buildEvidenceGraph → compileExperience → policy gates → ExperienceView` (see `docs/INTENT_EVIDENCE_EXPERIENCE_ARCHITECTURE.md`). Never add a source picker, an agent per specialty or disease, or runtime-generated UI: new sources are adapters in the registry, new taxonomy goes into the Domain Skill Graph, new representations are approved module families. Source adapters return only normalized documents/chunks/claims; the Experience layer only references evidence-graph ids. Browser-capable sources honour robots.txt and their usage policy, keep only attributed excerpts, and fail explicitly (`layout_changed`, `robots_disallow`, …). Knowledge changes, policy fixes and ranking changes are Changes in `control-plane/` with negative obligations, never silent production edits.

## Agent layer

Agents live in `lib/agents` (shared types, definitions, routing, policy) and `server/agents` (connectors → tools/services → executors → supervisor → store). The portal layer (`lib/portal`, `server/portal`) owns the physician-facing job, routing and result contract; agents are implementation units behind it. Never expose agents, tools or connectors as product sections. Every adapter declares `LIVE`, `MOCK` or `UNAVAILABLE`; never fake a successful external integration. Every medical evidence item keeps provenance and a verification status. Every action outside the product goes through `ActionConfirmationService`. "Since last visit" is computed from `createdAt` vs `lastSeenAt`, never hard-coded.

## Engineering discipline

Do not rewrite the repository from scratch, create another standalone HTML app, write Telegram parsing before ontology validation, destructively remove current tables during ontology introduction, or claim success without running verification. Prefer small coherent commits and run typecheck/tests/build after meaningful changes.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
