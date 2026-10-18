# Full-stack product rebuild

Status: implementation authority. Date: 2026-10-18.

## Authority and repository boundary

Work only in this local repository, on `rebuild/fullstack-v1`. The original checkout was clean. Repository integrity was then rechecked with `git fetch origin`: the local baseline was one commit behind. Initial scaffold changes were stashed, the working branch was fast-forwarded to `28e04941eff7481073ca481d107bd9e1d41d3832`, and the clean updated tree was verified before restoring the scaffold. `audit/v3-source-of-truth` is read-only baseline at `6be86212d14b9ab12913cb076eb9a66dc262982d`; no reset, rebase or ref update is permitted.

The supplied full-stack execution prompt and explicit repository instructions supersede prototype architecture decisions. This document is the implementation entry point. Product boundary remains defined by `00_START_HERE.md`, `16_V3_SOURCE_OF_TRUTH_AUDIT.md`, `product/PRODUCT_BOUNDARIES.md`, `ranking/RANKING_POLICY_V3.md` and current `12_DESIGN_ACCEPTANCE.md`. The latter is already rewritten for v3; the stale-file list in document 16 is outdated on that point.

`21_VISUAL_RESET_V2.md` exists in the fetched authoritative baseline at `28e0494` and is the primary visual direction. It supersedes the older full-workspace specialty coloring and prototype geometry. Its retained principles are: light canvas, calm cool atmosphere, strong readable typography, editorial variation, minimal chrome, source hierarchy. It does not authorize an HTML implementation. Older `19_SPECIALTY_VISUAL_IDENTITY.md` and `20_SPECIALTY_VISUAL_TOKENS.json` remain historical context where compatible. Use the reset’s calm light canvas and restrained interaction accents; never inherit the old dominant burgundy/blue workspace. Referenced `22_PHYSICIAN_FEED_UI_CONTRACT.md` is also absent. No other repository is an implementation input.

## Keep / migrate / deprecate

| Input | Decision | Destination / interpretation |
| --- | --- | --- |
| `data/goldenset-chunk-01.js` … `05.js`, manifest | Preserve immutable migration evidence | Decode without evaluating JS, verify SHA-256, validate and import typed records into PostgreSQL |
| `data/cardio-evaluation-slice-v1.json` | Keep | Deterministic 24-object cross-shell QA fixture |
| Golden Set sources (18) | Migrate | Source entities with original IDs and URLs |
| `context/knowledge/source_registry.cardiology.json` (25 observed sources) | Keep as research | Never equate metadata completeness with trust; do not silently merge with canonical IDs |
| `data/content-image-enrichment.json` | Migrate provenance | Render only verified, publishable, semantically matched assets; current prototype-only asset stays hidden |
| `phase2/content-runtime.js`, selectors, ranking | Migrate valid semantics, fix defects | Typed server domain, deterministic query/ranking, persistent shared state |
| A/B/C shell experiments | Migrate working models | Navigator, Toolbelt, Workspace over identical APIs and identities |
| `phase1/`, `phase2/`, `prototype/`, root `index.html` | Historical only | Never production entry points or runtime imports |
| Old root `docs/`, `schemas/`, patient-era context | Deprecate selectively | Exact map in `legacy/README.md`; retain research traceability |

## Architecture decision

One modular full-stack monolith: Next.js App Router, React, strict TypeScript; centralized CSS tokens and shared semantic components. Server components own page retrieval; client islands own explicit interactions. Route handlers expose content, sources, search, state, collections, analytics and health. Domain and ranking stay outside React.

PostgreSQL is the sole persistent store. Drizzle provides typed schema and versioned migrations. Docker Compose is the standard database environment. A pinned embedded native PostgreSQL development runner supports this workstation without Docker; it uses the same database engine and migrations, not an in-memory substitute. Production uses an external PostgreSQL service and a Node deployment.

Anonymous state uses opaque HttpOnly session cookies, no identity requirement. Preferences, saved/pinned IDs, follows, collections and recent activity persist server-side. Queries are private user state; analytics never stores raw queries or free-form text. Sessions can later be linked to accounts through an adapter without changing content identity.

Search is deterministic lexical retrieval with normalized Russian text, approved aliases, typed intent and inspectable rank components. Specialty is a mandatory server filter. Unknown currentness, dates, rights and editorial status remain unknown; database import time never becomes publication time.

## Data migration plan

1. Decode five gzip/base64 chunks with a constrained parser; verify normalized SHA-256 `1b0bd273b8652856209201e72474f40824b3fb987e16fc192863f376efafd7af`.
2. Validate 54 unique objects, 18 unique sources, source URLs, all source/parent/replacement references, valid states and 24 evaluation IDs. Preserve original records as provenance.
3. Normalize into typed source, content, asset and relationship tables. Make upserts transactional and idempotent. Preserve missing dates as null, never year zero.
4. Preserve archive separately from supersession: `is_current=no` alone is not evidence of a newer version. Show review uncertainty alongside archive where required.
5. Validate exact image render policy; no current supplied image qualifies for production rendering.
6. Import cardiology only. Oncology has a dedicated adapter, source/ingestion contract and controlled empty states. No fallback to cardiology.

## Risks and explicit gaps

- All 54 supplied objects have `needs_rights_review`; no content-license or medical approval is manufactured. Preserve source metadata and attribution, expose uncertainty, and keep public release subject to rights/editorial review.
- No approved oncology dataset, calculator formulas, drug database or jurisdiction-specific VMP rules. Provide navigational architecture and honest empty states.
- No local licensed YS font assets. Use one system sans-serif stack with Cyrillic support; document replacement contract.
- Existing audits contain contradictory/stale implementation and visual QA claims. New QA must run against the new application.
- Context is restricted to this repository, attached visual references and explicit chat instructions. External skills, knowledge bases and other projects are excluded from product and design decisions.
- External source availability is not guaranteed and must not be presented as verified during import.

## Acceptance and execution

Sequence: audit → empty app build → domain/import → design foundations → cardiology journey → search/state → A/B/C → isolated oncology → responsive/accessibility → reliability/analytics → final QA and docs. Independent implementation follows one shared type/API contract.

Required evidence: installation, running PostgreSQL, migrations and idempotent import; typecheck, lint, unit and PostgreSQL integration tests, production build, Playwright critical paths and specialty isolation, axe checks, keyboard smoke, screenshots actually inspected at 390/768/1024/1440. No completion claim based only on written code or inherited QA prose.

No active code implements patient identity, EHR/EMR, encounters, appointments, prescriptions, clinical orders or individual medical recommendations. No clinical formulas or oncology knowledge are invented. No deployment or external communication is part of the local execution authorization.
