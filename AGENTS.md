# KARDIO — repository execution rules

## Product boundary

KARDIO is a professional knowledge, evidence, source, tool and navigation environment for physicians.

The active product has no access to patient data, EHR/EMR/MIS, appointment schedules, encounter context, active patient state, patient-specific labs/imaging/ECG, prescriptions/orders, or patient-specific tasks/alerts/prioritization. Historical repository artifacts containing those concepts are legacy only and must not leak into active code, schemas, fixtures, UI, or product copy.

## Authority

Use this priority order:

1. explicit instructions in the current task;
2. `context/40_AGENT_FIRST_WORKSPACE.md` for product direction and information architecture (agent-first workspace);
3. `context/00_START_HERE.md`;
4. `context/16_V3_SOURCE_OF_TRUTH_AUDIT.md`;
5. `context/22_FULLSTACK_PRODUCT_REBUILD.md`;
6. `context/23_APP_ONTOLOGY_V1.md` once present;
7. other current v3 files;
8. existing implementation;
9. external technical references.

`context/21_VISUAL_RESET_V2.md` is authoritative for visual direction, not application architecture. Other repositories/projects are not product truth.

## Canonical data

The Cardiology Golden Set contains 54 canonical objects, 18 canonical sources and a 24-object evaluation slice. Treat it as immutable migration evidence. Preserve original IDs, source IDs, URLs, raw records, provenance, currentness, version relationships and rights uncertainty.

There is no approved canonical Oncology dataset yet. Never use Cardiology as Oncology fallback and never fabricate Oncology clinical content.

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

## Agent layer

Agents live in `lib/agents` (shared types, definitions, routing, policy) and `server/agents` (connectors → tools/services → executors → supervisor → store). Never expose tools or connectors as product sections. Every adapter declares `LIVE`, `MOCK` or `UNAVAILABLE`; never fake a successful external integration. Every medical evidence item keeps provenance and a verification status. Every action outside the product goes through `ActionConfirmationService`. "Since last visit" is computed from `createdAt` vs `lastSeenAt`, never hard-coded.

## Engineering discipline

Do not rewrite the repository from scratch, create another standalone HTML app, write Telegram parsing before ontology validation, destructively remove current tables during ontology introduction, or claim success without running verification. Prefer small coherent commits and run typecheck/tests/build after meaningful changes.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
