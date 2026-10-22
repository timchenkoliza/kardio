# Service blueprint — retention-first professional portal

Date: 2026-10-21 · Branch `feature/retention-first-portal`. What it takes — beyond code — to run each physician job. States are the internal taxonomy (`LIVE · SNAPSHOT · DERIVED · MOCK · UNAVAILABLE · BROKEN · UNVERIFIED`); «MVP state» is what this branch ships and was exercised, not planned.

Owner types: **PE** product engineering · **DS** data/source team · **ED** medical editor · **MX** medical expert panel · **MOD** moderation · **OPS** operations/support · **MKT** marketing · **BD** partnerships · **COM** commercial (pharma) · **AN** analytics.

---

## 1. Answer by sources (reference) — ~47% of demand

| Field | Value |
| --- | --- |
| Physician job | «What do reviews and guidelines say about X?» answered in seconds, with source and year |
| Frontend | Home input → `/[specialty]/ask?run=`: synthesis, verbatim conclusions, «Что дальше», follow-up input |
| Backend | `server/portal/manager.ts` → `executor-reference.ts`; router `lib/portal/router.ts`; lexicon `lib/portal/lexicon.ts` |
| Model / agent | No LLM. Deterministic routing, query building, title re-ranking, conclusion extraction |
| Tool | `searchPubmed` (relevance, review/guideline types, last 6 years; physician-approved journals first), `readAbstracts`, `searchMedical` (cardiology catalog) |
| Source/data | PubMed E-utilities — LIVE; Golden Set — SNAPSHOT (cardiology only) |
| Content/editorial | Lexicon upkeep (RU → EN concepts, ~150 INNs, populations, modifiers); evaluation set of real questions per specialty |
| Expert validation | MX: monthly review of 30 sampled answers per specialty (relevance of top-3, missing key review) |
| Moderation | Input risk gate (identifiers redacted, prescribing reframed, emergency/image blocked); output directive-wording gate |
| Operations | NCBI rate limits (3 rps without key — set `NCBI_API_KEY`); 30-min / 6-h caches |
| Marketing dependency | Positioning: «quotes, not paraphrase; English abstracts» must be set before launch |
| Partnership dependency | None for MVP; RU-language sources (e.g. publisher APIs) would raise usefulness |
| Commercial dependency | None in the answer itself; partner content never enters the evidence list |
| Analytics | `primary_intent_submitted`, `intent_routed`, `useful_result_rendered`, `first_value_delivered`, `source_opened`, `result_saved`, `followup_started` |
| Failure mode | PubMed down → honest «Чего не хватает»; wrong concept mapping → off-topic reviews (terms shown in trace); Russian-only questions with no recognised term → vague fallback |
| MVP state | LIVE, quote-based, English conclusions; verified on pediatrics/neurology/endocrinology questions |
| Post-MVP state | RU synthesis layer over the same quotes with claim-level validation; evaluation harness with precision@3 per specialty |
| Owner type | PE + DS (lexicon) + MX (evaluation) |

## 2. Drug reference

| Field | Value |
| --- | --- |
| Physician job | Indications, contraindications, warnings, dosing, interactions of a named drug; recent safety signals |
| Frontend | Shortcut «Справка по препарату»; drug label block with sections shown directly; ГРЛС hand-off |
| Backend | `executor-reference.ts` (job `drug`), `adapters/openfda.ts`, `services/drug-change.ts#drugChangesForDrugs` |
| Model / agent | None |
| Tool | `lookupDrugLabel` (Rx label preferred, OTC fallback labelled), `findDrugChanges`, `searchPubmed` |
| Source/data | openFDA SPL labels — LIVE (US labels); regulatory snapshot (9 records, cardiology drugs) — SNAPSHOT; ГРЛС — UNAVAILABLE |
| Content/editorial | INN dictionary; snapshot refresh of regulatory signals (ED, weekly) |
| Expert validation | MX: confirm the «US label ≠ RU instruction» boundary copy; review dosing display for pediatrics |
| Moderation | No patient-specific therapy; prescribing questions reframed |
| Operations | openFDA quota without a key is 240 requests/min and only 1,000/day per IP — a launch blocker at scale; set `OPENFDA_API_KEY` (120,000/day). 6-h cache |
| Marketing dependency | Must not be marketed as «инструкция по применению в РФ» |
| Partnership dependency | ГРЛС access or a licensed RU drug database (e.g. a reference publisher) — the main gap |
| Commercial dependency | Highest pharma adjacency: Brand page and «Полезное» formats sit next to, never inside, the label |
| Analytics | `drug_result_opened`, `source_opened`, `result_saved` |
| Failure mode | Drug not marketed in the US → «нет инструкции, проверьте ГРЛС»; brand-only names not in dictionary → unrecognised |
| MVP state | LIVE (US); verified for dapagliflozin, ibuprofen, atorvastatin |
| Post-MVP state | RU instruction source; brand → INN mapping; interaction checker from a licensed source |
| Owner type | PE + BD (RU source) + DS |

## 3. Clinical recommendations

| Field | Value |
| --- | --- |
| Physician job | Current recommendations on a topic and what changed |
| Frontend | Shortcut «Клинические рекомендации»; catalog changes (cardiology) + published guidelines; rubricator hand-off block |
| Backend | `executors.ts#guidelines`, `services/guideline-diff.ts` |
| Tool | `guidelineDiff` (catalog version chains + ESC snapshot), `searchPubmed` (Practice Guideline types), `readAbstracts` |
| Source/data | Golden Set + ESC snapshot — SNAPSHOT (cardiology); PubMed — LIVE (all); Minzdrav rubricator — UNAVAILABLE |
| Content/editorial | ED: RU guideline editorial snapshot per specialty would be the biggest lift (finite dataset, ~1–2 days per specialty for the index) |
| Expert validation | MX sign-off of «current version» labels |
| Operations | Rubricator programmatic access was unreachable from the build environment (connection resets) |
| Partnership dependency | Minzdrav rubricator API stability / professional societies |
| Analytics | `guideline_result_opened`, `source_opened` |
| Failure mode | International guideline shown without RU status — mitigated by explicit «статус в РФ не утверждается» |
| MVP state | LIVE international + SNAPSHOT cardiology; RU status is a hand-off |
| Post-MVP state | Curated RU index per specialty (SNAPSHOT with retrieval dates), then rubricator connector |
| Owner type | ED + DS + PE |

## 4. Deep investigation (research)

| Field | Value |
| --- | --- |
| Physician job | Evidence on a comparison or treatment-choice question, with comparison and export |
| Frontend | Shortcut «Разбор по исследованиям»; portal result + link to full report (`/agents/research?run=`) |
| Backend | Existing research agent, background jobs, structured evidence, comparison, export (reused) |
| Source/data | PubMed — LIVE; catalog — SNAPSHOT |
| Expert validation | MX review of comparison tables (study normalization) |
| Analytics | `research_result_completed`, `source_opened`, `result_saved` |
| Failure mode | Few recognised terms → thin search; mitigated by the new lexicon |
| MVP state | LIVE (reused); lexicon now covers six specialties |
| Owner type | PE |

## 5. «Для вас» and updates (the return loop)

| Field | Value |
| --- | --- |
| Physician job | See what changed since the last visit without asking |
| Frontend | Home «Для вас»: one card contract (what, why it matters, why shown, source + freshness, action); optional topic nudge |
| Backend | `server/portal/for-you.ts`; background catch-up of `whats_new`, `guidelines`, `events`, `learning` (no setup needed) |
| Tool | `searchPubmed` (title-scoped specialty or chosen topics; physician-approved journals; clinical types), catalog, snapshots |
| Source/data | PubMed — LIVE; snapshots — SNAPSHOT; saved materials — LIVE |
| Content/editorial | ED: weekly review of what the feed surfaced per specialty (precision, tangential items) |
| Moderation | Source policy: rejected sources never shown; non-whitelisted at most «частично подтверждено» |
| Operations | Catch-up runs on visit (serverless); without a database results are per-instance (Settings says so) |
| Marketing dependency | Return triggers (email/push digest) are not built — the loop relies on habitual visits |
| Commercial dependency | One disclosed partner slot, never first, only where a partner format exists |
| Analytics | `portal_opened`, `return_session`, `update_opened_since_previous_session`, `recommendation_reason_shown`, `specialty_signal_used`, `topic_signal_added` |
| Failure mode | Sparse fortnight in approved journals → small feed; honest empty state |
| MVP state | LIVE for all six specialties; since-last-visit from stored `createdAt` vs `previousVisitAt` |
| Post-MVP state | Digest delivery channel; per-topic precision tuning; RU sources |
| Owner type | PE + ED + MKT (delivery) |

## 6. Events

| Field | Value |
| --- | --- |
| Physician job | Find a relevant upcoming congress or school and take the next step |
| Frontend | Finite, chronological list; date block, format, organiser, snapshot freshness; calendar/registration through confirmation; organiser hand-offs |
| Backend | `executors.ts#events`, `services/event.ts` (source policy applied before ranking), `action-confirmation.ts` |
| Source/data | 18-record curated snapshot (2026-10-19) — SNAPSHOT; 13 rnmo.ru listings hidden (physicians rejected the aggregator); НМО portal — UNAVAILABLE |
| Content/editorial | ED: weekly snapshot refresh per specialty from organiser pages (the real cost of this job) |
| Partnership dependency | Societies' calendars / НМО portal access |
| Commercial dependency | «Событие» partner format (disclosed) |
| Analytics | `event_opened`, `event_registration_clicked` |
| Failure mode | Stale snapshot → past events filtered by date; other specialties → honest limited state, never cardiology events |
| MVP state | SNAPSHOT for cardiology (ESC/AHA congresses); UNAVAILABLE + verified hand-offs for five specialties |
| Post-MVP state | Organiser feeds per specialty; НМО accreditation status from the portal |
| Owner type | ED + BD + PE |

## 7. Learning next step

| Field | Value |
| --- | --- |
| Physician job | «What should I read next, and why?» |
| Frontend | Card in «Для вас»; `/ask?job=learning` with «Подобрать по моим вопросам»; done/progress toggle |
| Backend | `executor-learning.ts`: signal choice (current request → repeated interest from stored runs → explicit topic → recent question → saved material → specialty) |
| Source/data | PubMed reviews — LIVE; cardiology catalog modules — SNAPSHOT |
| Expert validation | MX: curated «core reading» per specialty would improve cold start |
| Analytics | `learning_recommendation_opened`, `recommendation_reason_shown`, `specialty_signal_used` |
| Failure mode | Cold start picks a recent but marginal review — reason states it is specialty-based |
| MVP state | LIVE; never claims repeated interest without ≥2 stored runs |
| Post-MVP state | НМО-accredited modules; progress across sessions with accounts |
| Owner type | PE + MX |

## 8. Commercial layer (partner formats)

| Field | Value |
| --- | --- |
| Physician job | None — reach for partners without breaking utility |
| Frontend | Disclosed partner card in «Для вас» (dashed, labelled, sponsor named, never first) and on agent pages; Settings toggle |
| Backend | `lib/pharma/placement-formats.ts`, `services/partner.ts`, pharma content studio (`/[specialty]/pharma`) |
| Source/data | Synthetic examples — MOCK (labelled «пример формата») |
| Moderation | MOD/legal review of every placement; disclosure is enforced in code (`validateEvidence` drops partner drafts without disclosure) |
| Commercial dependency | Real contracts, targeting rules, frequency caps — not built |
| Analytics | Partner impressions/clicks are not yet instrumented (launch gap) |
| MVP state | MOCK container with the final card contract |
| Owner type | COM + MOD + PE |

## 9. Evaluation and analytics

| Field | Value |
| --- | --- |
| Backend | `lib/portal/metrics.ts` (event contract + retention computation), `server/portal/telemetry.ts`, `npm run portal:metrics` |
| Data | `analytics_events` (PostgreSQL); in-process ring without a database |
| Privacy | No query text in events — category, length bucket, ids, timings only |
| MVP state | LIVE; verified end-to-end into PostgreSQL |
| Gap | Anonymous cookie identity: cross-device retention is undercounted; no accounts |
| Owner type | AN + PE |

---

## Launch questions (isolated, with safe fallbacks)

| Question | Why it matters | Current safe fallback |
| --- | --- | --- |
| May US FDA label text be shown to RU physicians as reference? | Not the registered RU instruction | Shown verbatim with a boundary notice and ГРЛС link; never called «инструкция в РФ» |
| May English abstract conclusions be quoted at this length? | Publisher rights | Short conclusion excerpts with source link; no full text |
| Advertising rules for the partner slot in a professional portal | Pharma promotion to HCPs | Disclosed, separate, MOCK only until reviewed |
| Retention measurement on an anonymous cookie | Consent banner / privacy policy | No PII, no query text; ids only |
| Rubricator status assertions | Official status of RU guidelines | Never asserted; hand-off link |

## Operational labour per month (estimate for six specialties, MVP)

| Work | Owner | Load |
| --- | --- | --- |
| Lexicon upkeep (new INNs, misses from logs) | DS | ~2 days |
| Answer quality sampling (30 questions × 6 specialties) | MX | ~3 expert-days |
| Event snapshot refresh (6 specialties, weekly) | ED | ~4 days |
| RU guideline index (one-off per specialty, then deltas) | ED + MX | ~10 days one-off, ~1 day/month after |
| Partner placement review | MOD/legal | per placement |
| Retention review (cohorts by specialty and first job) | AN | ~1 day |
