# CURRENT_APP_MAP — Kardio before the agent-first migration

Audit date: 2026-10-19. Baseline: `main` @ `52b09f0` (all feature/fix/hotfix branches are already merged into `main`; `main` is what the Vercel project builds).
Migration branch: `migration/agent-first-workspace`.

This map treats the current navigation and feature taxonomy as **legacy implementation artifacts**, not requirements. Its purpose is to decide what to preserve, what to wrap behind new boundaries and what to retire.

---

## 1. Runtime and deployment

| Aspect | Current state |
| --- | --- |
| Framework | Next.js 16.4 App Router, React 19.3, strict TypeScript, `output: "standalone"` |
| Persistence | PostgreSQL + Drizzle when `DATABASE_URL` is set; otherwise **static fallback**: Golden Set decoded from `data/goldenset-chunk-0*.js`, anonymous session state in a bounded in-process `Map` (hotfix 2026-10-19) |
| Vercel specifics | No `vercel.json` in the app root. Relies on the no-DB fallback (`server/repositories/catalog.ts`, `server/services/state.ts`, `app/api/events/route.ts`). `next.config.ts` traces `data/**` and the cardiology source registry into the bundle. Security headers + strict CSP (`connect-src 'self'`) |
| Identity | Anonymous HttpOnly cookie `kardio_session` (64-hex), 180-day TTL. No accounts |
| CI | `.github/workflows/ci.yml`: data validation → migrate → seed ×2 (idempotency) → typecheck → lint (eslint + `check-design-tokens` + `check-product-copy`) → unit → integration → audit → build → Playwright e2e |
| Tests | 31 unit files (vitest), 1 integration (PostgreSQL), 3 e2e specs (Playwright) |

## 2. Routes

| Route | File | What it renders today |
| --- | --- | --- |
| `/` | `app/page.tsx` | redirect → `/cardiology` |
| `/[specialty]` | `app/[specialty]/page.tsx` | One page that switches on `?view=` and `?shell=`: feed («Лента»), search (`?q=`), kind tabs (`?kind=`), and 10 sidebar destinations |
| `/[specialty]?view=saved` | same | «Мои материалы» = saved Golden Set items |
| `?view=sources` | same | Source directory (canonical + curated external) |
| `?view=tools` | `components/clinical-tools-hub.tsx` | CHA₂DS₂-VA, HAS-BLED (local, deterministic) |
| `?view=drugs` | `components/drug-intelligence-workspace.tsx` | Synthetic drug **ratings** (demo) + local rating form |
| `?view=consilium` | `components/consilium-workspace.tsx` + `/api/consilium` | Synthetic doctor personas chat; optional Expert Twins sidecar |
| `?view=reference` | `components/reference-hub.tsx` | Links to external references |
| `?view=imaging` | `ImagingWorkspace` | Anatomy explorer + local medical media viewer |
| `?view=referral` | `VmpHub` | Official ВМП documents |
| `?view=events` | `EventsHub` | Canonical `event` objects (2 RKO webinars/forums, past) or external links |
| `/[specialty]/education` | `app/[specialty]/education/page.tsx` | Video lectures + external education platforms |
| `/[specialty]/content/[id]` | `app/[specialty]/content/[id]/page.tsx` | Material detail with provenance, currentness, version chain, related |
| `POST /api/state` | `app/api/state/route.ts` | All user-state commands (save/pin/follow/collections/recent/preferences) |
| `POST /api/events` | `app/api/events/route.ts` | Analytics (7 event names), DB-only persistence |
| `GET/POST /api/consilium` | `app/api/consilium/route.ts` | Expert Twins proxy (`EXPERT_TWINS_URL`, otherwise unavailable) |
| `GET /api/health` | | liveness |
| `GET /api/prototype-media/echo` | | dev-only prototype echo clip |

Shells: `explore` (feed), `practice` (`PracticeGenUiSurface`), `workspace` (`WorkspaceIntegratedSurface` → clinical case upload + research agent).

## 3. Old navigation taxonomy (left rail, `components/product-frame.tsx`)

`Лента/Практика/Пространство` · `Мои материалы` · `Источники` · `Калькуляторы` · `Препараты` · `Консилиум` · `Справочник` · `Визуализация` · `ВМП` · `События` · `Обучение` + a settings dialog with three "shells".

Problems against the new direction: 11 peer destinations of different nature (sources, tools, products, data types) compete with each other; the home is a feed; sources (`Источники`) and infrastructure-like capabilities are first-class navigation; Consilium and image viewing are top-level; nothing is expressed as a job the doctor delegates.

## 4. Data model

### Canonical professional data (preserve — immutable migration evidence)
- **Cardiology Golden Set v2**: 54 objects, 18 sources, SHA-256 verified, decoded without `eval` (`server/ingestion/goldenset.ts`). Real version chains: `gl-ph-2020 → gl-ph-2024`, `gl-vt-2020 → gl-vt-2025`; currentness states `current / review / superseded / archived`; `rights_status = needs_rights_review` for all.
- 24-object evaluation slice; image enrichment with render policy; 25 observed research sources (`context/knowledge/source_registry.cardiology.json`, `trust_status = unknown_unless_separately_verified`).
- Ontology (`db/ontology-schema.ts`, `lib/ontology/*`): nodes, edges, evidence records, state facts, domain events, raw archive artifacts, distribution post candidates. Evidence TTL semantics (`verified → needs_reverification`).
- Event resolution (`db/resolution-schema.ts`, `server/ingestion/event-*`): candidate/mention/transport tables for explicit scardio.ru event references extracted from private Telegram exports (offline scripts).

### Prototype / synthetic data (keep isolated, never evidence)
- `lib/demo/hardcoded-topic-content*.ts`: generated editorial cards («Редакционный черновик», `trustStatus: requires_review`) appended to the cardiology catalog. **Not source-validated → must never be used as evidence by agents.**
- `lib/ui/drug-intelligence.ts` synthetic ratings; `lib/ui/consilium.ts` synthetic personas; `lib/demo/cardio-partner-formats.ts` synthetic partner formats (labelled).

### User state
- `UserState` JSON (`lib/domain/types.ts`) in `anonymous_sessions.state`: specialty, shell, onboarding, saved/pinned ids, followed sources/topics, research interests, recent (40), collections (30), UI block preferences.
- Browser-only: drug ratings (`localStorage`), consilium history (`localStorage`), clinical cases (`IndexedDB`), onboarding flag.

## 5. Integrations

| Integration | Status | Where |
| --- | --- | --- |
| PostgreSQL | live when configured | `db/client.ts` |
| Expert Twins sidecar | optional, off unless `EXPERT_TWINS_URL` | `server/services/expert-twins.ts` |
| Google Drive / local mirror / Yandex Disk | offline ingestion scripts only | `server/ingestion/*-drive*`, `yandex-disk-api.ts` |
| Telegram Desktop HTML exports | offline parser → distribution candidates | `server/ingestion/telegram-*` |
| scardio.ru event pages | offline inspection scripts | `server/ingestion/event-page-inspection.ts` |
| Article motion renderer | offline batch | `server/media/article-motion-renderer.ts` |
| PubMed, drug registries, calendars, email | **absent** | — |

## 6. Agent / reasoning / search code

| Code | What it is | Decision |
| --- | --- | --- |
| `lib/ui/workspace-research-agent.ts` | Deterministic lexical topic ranking with Russian stemming + patient-marker detector | **Preserve → SearchService (catalog adapter) + RiskCheck** |
| `lib/ui/feed.ts` (`normalizeQuery`, `selectFeedContent`, `deterministicContentOrder`, `relatedContent`) | Lexical search + deterministic ordering | **Preserve → SearchService / rankEvidence** |
| `lib/clinical-case/anonymizer.ts` | Regex redaction of direct identifiers (email, phone, СНИЛС, ОМС, passport, ФИО, address, birth date) | **Preserve → DeidentificationService** |
| `lib/ontology/evidence.ts`, `lib/currentness` | Evidence verification/TTL and currentness resolution | **Preserve → EvidenceService** |
| `lib/ui/consilium.ts`, `/api/consilium`, Expert Twins | Persona simulation | **Retire from product surfaces; keep code** |
| `lib/ui/pbz-history.ts` | Safe PBZ query clustering (demo signals) | Keep; not used by agents |
| `lib/ui/gen-ui.ts`, `gen-ui-stack.tsx`, block taxonomy | User-controlled block composition | Retire from home; keep code |

## 7. Source / evidence model

Source records carry `trustStatus`, `commercialStatus`, `metadataCompleteness`, `lastCheckedAt`; content carries `canonicalUrl`, `publicationDate/Year`, `currentness`, `version`, `supersedes/supersededBy`, `editorialStatus`, `rightsStatus`, `provenance{type, asset, location, notes}`. This is good provenance raw material, but there is **no per-claim Evidence object, no verification status per claim, no retrieved-at for runtime results and no connector abstraction**.

## 8. Reusable visual primitives

`app/styles/tokens.css` (lavender/violet accent `#989bfb` / `#7478e8` / ink `#4d50b8`, neutral canvas, radii, shadows) is the single token source, enforced by `scripts/check-design-tokens.mjs` (no raw colors / custom properties outside tokens). Reusable: `eyebrow`, `primary-button`, `secondary-button`, `quiet-button`, `icon-button`, `source-mark`, `save-button`, toast, dialog, skip link, `SectionHelp`. 30 page-level CSS files are layered passes on the legacy layouts; they are not reused for the new workspace.

## 9. Reusable business logic (preserve)

Golden Set loader/validator/normalizer; catalog repository with static fallback; session + state service and origin/rate-limit/body-size guards (`server/http.ts`); currentness; ontology ids/relations/evidence; lexical search/ranking; anonymizer; calculators; curated external source registry (navigation aids with provenance class); partner format inventory (with disclosures); event-resolution signal extractors (for future event connector).

## 10. Code to retire from active surfaces (kept in repo, unlinked)

Feed home and kind tabs («Лента»), three-shell selector + onboarding about shells, PBZ context strip on home, Consilium workspace, Imaging workspace + clinical-case upload of images/DICOM, Reference hub / VMP / Tools as first-class sections, Source directory as a section, Gen-UI block stacks on home, synthetic drug ratings UI.

## 11. Smallest safe migration path

1. Freeze the legacy UI under `/[specialty]/legacy` (same components, same tests) and stop linking it from primary navigation.
2. Add an agent domain (`lib/agents/*`) and a server capability layer (`server/agents/*`: connectors → tools → services → supervisor) that **reuses** the catalog repository, lexical ranking, currentness and anonymizer.
3. Add persisted agent state (subscriptions/preferences, runs, results with stable keys, materials, action requests, last-seen) behind a store interface: PostgreSQL tables (migration `0004`) when configured, in-memory + cookie mirror otherwise (same pattern as the existing no-DB hotfix).
4. Replace `/[specialty]` home with «Главное»; add «Мои агенты», «Мои материалы», «Настройки»; map old `?view=` links to their agent/material equivalents.
5. Keep CI contract: typecheck, lint (incl. token + copy checks), unit, integration, build, e2e.
