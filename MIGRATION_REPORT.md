# Migration report — content portal → agent-first physician workspace

Branch: `migration/agent-first-workspace` (base `52b09f0`, = `origin/main` on 2026-10-19). Not merged, not deployed. Production (`kardio-eta.vercel.app`) is untouched.

Companion documents: `CURRENT_APP_MAP.md` (audit before changes), `docs/AGENT_FIRST_ARCHITECTURE.md` (how it works), `context/40_AGENT_FIRST_WORKSPACE.md` (product direction for future contributors).

---

## A. Architecture summary

USER sees JOBS → AGENTS own GOALS → TOOLS own CAPABILITIES → CONNECTORS own ACCESS.

- **Jobs (UI):** Главное (command center: composer «Что хотите делегировать?» + 7 agent cards + pending confirmations + recent results), Мои агенты, Мои материалы, Настройки. No feed, no source or tool sections.
- **Agents:** 7 explicit `AgentDefinition`s — Что нового для меня, Изменения рекомендаций, Препараты, Исследовать тему, События, Моё обучение, Мои материалы — each with job, goal, inputs, outputs, tools, sources, permissions, schedule, defaults and primary action.
- **Supervisor (hidden):** `routeTask → selectAgent → createPlan → executeTool → validateEvidence → checkRisk → requestApproval → persistResult`. Every run stores its plan, tools, connector modes, timings, gaps and risk notices; the UI shows it as «Как получен результат».
- **Tools / services:** 15 tools over shared services (Search, Evidence, FactCheck, RiskCheck + Deidentification, GuidelineDiff, DrugChange, Event, Learning, Material, Partner, ActionConfirmation).
- **Connectors:** 16, each declaring `LIVE / MOCK / UNAVAILABLE` and a data origin. Nothing unavailable is simulated.
- **Trust gates:** fact check on every evidence item (SUPPORTED / PARTIALLY_SUPPORTED / UNSUPPORTED / UNKNOWN with provenance), input/output risk check, confirmation for every action outside the product.
- **State:** PostgreSQL (migration `0004`) or, without a database, memory + HttpOnly profile cookie. "New since last visit" = `createdAt > lastSeenAt`, computed, never hard-coded.

## B. CURRENT → TARGET map

| Current (before) | Target (now) | How |
| --- | --- | --- |
| Home = feed «Лента» with 3 shells | Главное = delegation composer + agent cards | new `(workspace)` route group |
| `?view=drugs` synthetic drug ratings | Агент «Препараты»: change detection since last visit (6 change types), evidence, no prescribing | redirect `?view=drugs` → `/agents/drugs` |
| `?view=events` 2 past canonical events | Агент «События»: 18 real upcoming events, ranking with reasons, .ics with reminders, registration hand-off | redirect → `/agents/events` |
| `/education` + education tab | Агент «Моё обучение»: route from current guidelines, lectures, НМО events, progress | redirect `?view=education` → `/agents/learning` |
| `?view=saved` saved ids | Мои материалы: saved results, links, notes, uploads (TXT/MD/CSV/HTML/DOCX parsed, private), collections, retrieval over own base | redirect → `/materials` |
| Search `?q=` over catalog | Агент «Исследовать тему»: plan → catalog + PubMed (+ own materials) → fact check → synthesis with gaps | redirect → `/agents/research?q=` (prefilled) |
| Workspace research agent (shell) | Ranking logic reused by Search service | — |
| `?view=sources` source directory | Settings → «Источники и подключения» with honest modes; trusted/excluded source chips per agent | redirect → `/settings#sources` |
| Консилиум (synthetic personas) | Retired from product; notice in archive | `?view=consilium` → `/legacy?view=consilium` (notice) |
| Визуализация / image viewer | Retired; composer blocks image interpretation | `?view=imaging` → notice |
| Калькуляторы, Справочник, ВМП | Kept only in the archive (not agents) | `/legacy?view=…` |
| Settings dialog with 3 shells | Chip setup (topics, sources, content types, frequency, delivery, formats, horizon, goals) | onboarding on Главное + per-agent panel |
| Pharma partner formats (synthetic) | Partner slot: labelled «Партнёрский материал», separate rank, switchable, MOCK | `server/agents/services/partner.ts` |

## C. Files changed

`git diff --stat 52b09f0..HEAD`: about 100 files, ~12.5k lines added, ~200 removed. Highlights:

- **New domain & policy:** `lib/agents/{types,definitions,vocabulary,intent,risk-rules,profile,text,format,metrics}.ts`
- **New server layer:** `server/agents/{connectors,context,drafts,tools,executors,supervisor,workspace,commands,http,page-session,telemetry}.ts`, `server/agents/adapters/pubmed.ts`, `server/agents/snapshots/{guideline-updates,drug-changes,events}.ts`, `server/agents/services/*` (11), `server/agents/store/*` (5)
- **DB:** `db/agent-schema.ts`, `db/migrations/0004_agent_workspace.sql`, `db/migrations/meta/{_journal.json,0004_snapshot.json}`, `db/client.ts`, `drizzle.config.ts`
- **API:** `app/api/agents/route.ts`, `app/api/agents/materials/upload/route.ts`, `app/api/agents/actions/[id]/ics/route.ts`, `app/api/agents/metrics/route.ts`
- **Routes/UI:** `app/[specialty]/(workspace)/{layout,page}.tsx`, `agents/page.tsx`, `agents/[agent]/page.tsx`, `materials/page.tsx`, `settings/page.tsx`, `content/[id]/page.tsx` (moved), `app/[specialty]/legacy/page.tsx` (moved old home), `components/workspace/*` (18), `components/product-frame.tsx` (legacy nav trimmed), `app/layout.tsx`
- **Styles:** `app/styles/tokens.css` (`--ws-*` tokens, purple AI-native palette, oncology overrides), `app/styles/agent-workspace.css`
- **Fixes to existing code:** `lib/clinical-case/anonymizer.ts`, `lib/ui/pbz-history.ts` (Cyrillic word boundaries — see J), `tests/integration/catalog-read-model.test.ts` (failing on main — see H), `vitest.config.ts` (ignore build output), `app/icon.svg`
- **Tests:** `tests/unit/agent-{routing-risk,evidence,supervisor,materials-commands,pubmed-adapter}.test.ts`, `agent-test-utils.ts`; `tests/integration/agent-store.test.ts`; `tests/e2e/agent-workspace.spec.ts`; updated `release-smoke`, `decision-layout`, `visualization-layout` specs
- **Docs/ops:** `CURRENT_APP_MAP.md`, `MIGRATION_REPORT.md`, `docs/AGENT_FIRST_ARCHITECTURE.md`, `context/40_AGENT_FIRST_WORKSPACE.md`, `AGENTS.md`, `context/00_START_HERE.md`, `README.md`, `.env.example`, `scripts/agent-metrics.ts`, `package.json` (`agents:metrics`)

## D. Routes changed

| Route | Status |
| --- | --- |
| `/[specialty]` | **New:** Главное (was the feed). Legacy `?view=`, `?kind=`, `?shell=` and `?q=` redirect as in B |
| `/[specialty]/agents` | **New:** Мои агенты (enable/disable, state, last run) |
| `/[specialty]/agents/[agent]` | **New:** `whats-new`, `guidelines`, `drugs`, `research`, `events`, `learning` — results, config, run trace, history |
| `/[specialty]/materials` | **New:** Мои материалы |
| `/[specialty]/settings` | **New:** interests, sources & connectors, partner toggle, privacy, demo reset, metrics, archive link |
| `/[specialty]/content/[id]` | **Moved** into the workspace shell; back link «Главное»; topic chips open the research agent |
| `/[specialty]/legacy` | **New location** of the previous interface (frozen archive, not in navigation) |
| `/[specialty]/education` | Unchanged (legacy shell); replaced in IA by Моё обучение |
| `POST /api/agents` | **New:** command endpoint (zod-validated, same-origin, rate-limited 60/min) |
| `POST /api/agents/materials/upload` | **New:** multipart upload ≤ 4 MB, private to the session |
| `GET /api/agents/actions/[id]/ics` | **New:** confirmed calendar file |
| `GET /api/agents/metrics` | **New:** current-session metrics |
| `/api/state`, `/api/events`, `/api/consilium`, `/api/health` | Unchanged |

## E. Removed / deprecated surfaces

Nothing working was deleted; surfaces were removed from primary navigation and frozen.

| Surface | Status | Next step |
| --- | --- | --- |
| Лента (feed) and Практика/Пространство shells | Archive only (`/legacy`, renamed «Обзор»); `workspace` shell maps to `explore` | delete after one release if archive traffic is ~0 |
| Консилиум | Retired: notice in archive; `/api/consilium` still answers | remove API + `lib/ui/consilium.ts` |
| Визуализация (image viewer/interpretation) | Retired: notice; composer blocks interpretation requests | remove imaging workspace |
| Источники as a section | Replaced by Settings → connectors and per-agent source chips | — |
| Калькуляторы, Справочник, ВМП | Archive only | decide: tool inside research agent, or drop |
| Synthetic drug ratings | Archive only; not used by agents | remove |
| Editorial drafts (`lib/demo/hardcoded-topic-content*`) | Still in catalog; **never used as evidence** by agents (`isUnverifiedEditorialDraft`) | remove from catalog when real content replaces it |

## F. New domain models

`UserProfile` (interests, subscriptions, preferences, partnerContent, learningProgress, visit marks) · `AgentDefinition` · `AgentSubscription` (enabled, lastRunAt, **lastSeenAt**) · `AgentPreference` (topics, contentTypes, trusted/excluded sources, frequency, delivery, formats, horizon, goals) · `AgentRun` (trigger, status, intent, plan, toolsUsed, resultIds, newResultCount, riskNotices, synthesis, duration) · `AgentResult` (stable key, createdAt = first seen, observedAt, evidence[], provenance, actions, partner, reasonShown, rank) · `Evidence` (+ `Provenance`) · `Material` (ownership `USER_UPLOADED / PUBLIC_SOURCE / PARTNER_SOURCE / GENERATED`, parse status, redactions) · `MaterialCollection` · `ActionRequest` (kind, status, requiresConfirmation, preview, payload) · `ConnectorDescriptor` · `AgentCardState` · `WorkspaceView`. Tables: `agent_profiles`, `agent_runs`, `agent_results`, `user_materials`, `material_collections`, `action_requests`.

## G. Live vs mock integrations

| Connector | Mode | What is real |
| --- | --- | --- |
| Каталог РКО и РКЖ | LIVE (catalog snapshot) | Golden Set: 54 objects, 18 sources, version chains |
| PubMed / журналы | **LIVE (runtime API)** | NCBI E-utilities — verified against the real API from this environment: 146 hits for an HF + SGLT2 query; the research agent returned the NEJM trial on anticoagulation at intermediate stroke risk as #1 for a Russian question about ПОАК |
| Рекомендации ESC | LIVE (curated snapshot 2026-10-19) | 4 ESC 2026 publications with quotes and URLs |
| Регуляторные изменения | LIVE (curated snapshot 2026-10-19) | 9 records: baxdrostat RU and FDA registration, aficamten approval and boxed warning/REMS, selexipag announcement, ESC 2026 drug-class changes, SINGLE-AF, STAREE |
| Афиши событий | LIVE (curated snapshot 2026-10-19) | 18 upcoming events (rnmo.ru accredited RKO events, ESC, AHA) |
| Ваши документы | LIVE (user content) | parsing + indexing + private retrieval |
| Календарь .ics | LIVE | file with VALARM −1 day / −1 hour after confirmation |
| Партнёрские материалы | **MOCK** (synthetic fixture) | labelled, separate slot, switchable |
| ГРЛС, Портал НМО, ЛК РКО, Telegram, открытый веб, прямая запись в календарь, почта | **UNAVAILABLE** | visible in Settings; agents hand off with a link or a `mailto:` draft |

### Your wish list → what exists now

| Wish | Priority | Result |
| --- | --- | --- |
| Рабочее пространство | — | Done: Главное + agents + materials |
| События: найти, зарегистрировать на все, календарь, почта, будильник | high | Discovery, ranking with reasons and «Все в календарь с напоминаниями» (one .ics, two reminders = «будильник») are done; e-mail = draft to yourself. **Registration on your behalf is not done** — no organiser API; the agent opens each registration page |
| Telegram-каналы | high | UNAVAILABLE. Reading channels needs either a bot added to each channel or a user-session client (account-level access, needs consent and legal review). Next: public `t.me/s/` previews for an allow-listed set, with provenance |
| Фарма / образование | high | Partner slot (MOCK, labelled) + «Моё обучение» |
| Флибуста: учебник в мою базу | high | **Not implemented.** Flibusta distributes copyrighted books without licences. The legal path exists: upload your own copy to Мои материалы (DOCX/TXT/HTML indexed; PDF parsing is the next step) |
| РКО под моей учёткой | medium | UNAVAILABLE connector; requires an agreement/API with РКО. The product never stores passwords |
| Таблетки | medium | «Препараты»: change detection, no prescribing |
| Источники | medium | Not an agent by design: source chips + Settings |
| Публикатор | medium | Not implemented (`publishing` action is declared unavailable) |
| Справочник | — | Research agent over catalog + PubMed; old reference hub in the archive |
| Оркестратор кардиолог / мои материалы | — | Supervisor (hidden) / «Мои материалы» agent |
| Пациент, кейсер, case bench, консилиум, коммуникатор с пациентом | low | Out of scope: repository rules forbid patient data; consilium retired |
| Чтение изображений | super-low | Not offered; blocked in composer |
| Купи лекарства | low | Not implemented; `purchase` is declared unavailable |

## H. Tests executed

The full CI pipeline (`.github/workflows/ci.yml`) was reproduced locally on the final commit with the real toolchain (`npm ci`, Node 22, PostgreSQL 16, Chromium):

| CI step | Result |
| --- | --- |
| `npm run data:validate` | pass |
| `npm run db:migrate` (0000 → 0004) | pass |
| `npm run db:seed` ×2 (idempotency) | pass |
| `npm run typecheck` (strict `tsc --noEmit`) | pass, 0 errors |
| `npm run lint` (eslint + design-token check + product-copy check) | pass, 0 errors / 0 warnings |
| `npm test` (vitest, 36 files) | **163 / 163** |
| `npm run test:integration` (PostgreSQL) | **3 / 3**, including the new agent-store test (profile, runs, stable results across re-runs, materials, isolation between sessions) |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |
| `npm run build` (next build, standalone) | pass; all routes compiled |
| `npm run test:e2e` with PostgreSQL | **19 / 19** |
| `npm run test:e2e` **without** a database (how Vercel runs today) | **19 / 19** |

Also verified: the PubMed adapter against the real NCBI API (and the HTTP 429 it hit under parallel runs, now handled); DOCX parsing of your «AI agents in healthcare.docx» (45,928 characters indexed).

Found and fixed along the way: the existing catalog integration test failed on `main` too (expected 54 items, the read model returns 54 + 720 labelled prototype cards), so CI on `main` has been stopping before build and e2e. The test now checks the canonical Golden Set explicitly.

CI differences to keep in mind: e2e ran against the preinstalled Chromium build rather than the exact Playwright 1.64 revision, and with video recording off (no ffmpeg here). The repository config is unchanged.

## I. Responsive QA (390 / 768 / 1440)

Real browser against the production build without a database, after onboarding through the chips and one composer task (live PubMed): Главное, Мои агенты, all 6 agent pages, Мои материалы, Настройки, a content page and the oncology home — 12 pages × 3 widths.

- **36 / 36: no horizontal overflow** (`scrollWidth == viewport`); the e2e suite asserts the same for 8 workspace pages at each width.
- No console errors after the favicon fix.
- 390: single column, bottom tab bar «Главное · Агенты · Материалы · Настройки», agent cards as a horizontal snap carousel on Главное, hero description hidden under 640 px, actions wrap.
- 768: top navigation, agent carousel with two visible cards.
- 1440: four-column agent grid with «Что нового для меня» spanning two columns, composer beside the hero copy, results + «Как получен результат» side by side on agent pages.
- Fixed during QA: link colour leaking into legacy buttons, oversized content headings, duplicated learning-module titles, "new since last visit" shown for non-monitoring agents, duplicate ARIA group on chip rows, raw ontology ids on content topic chips, Russian plurals in bulk actions.

## J. Remaining risks

1. **Nothing has been pushed.** This session could read the GitHub repository but had no push rights, so the branch is delivered as a git bundle and a patch series.
2. **Vercel has no database.** Without `DATABASE_URL` results and materials live in instance memory: uploads can disappear between cold starts (Settings says so). Profile, settings and last-seen marks survive through the HttpOnly cookie.
3. **Snapshot freshness.** Guideline, drug and event snapshots are dated 2026-10-19 and need an editorial refresh process (weekly), or they become stale silently. They show the retrieval date on every card.
4. **Regulatory records are secondary sources** (news, FDA pages) until ГРЛС is connected; they are marked partially supported and say «сверьте с реестром».
5. **PubMed** depends on NCBI availability and rate limits; set `NCBI_API_KEY` in production.
6. **Partner content** is synthetic. Real pharma material needs legal review (advertising law, disclosure, separation from evidence ranking) before going live.
7. **De-identification is rule-based.** It catches labelled identifiers, phones, e-mails, СНИЛС, ОМС, passport and «пациент + фамилия», not every free-text identifier. Patient-specific input triggers a notice; the product still must not be used for patient data.
8. **Anonymous sessions only.** Cross-device continuity and "my RKO account" need real authentication.
9. **Fixed while auditing:** the existing anonymizer and PBZ privacy guard used `\b` with Cyrillic, which never matches in JavaScript; labelled ФИО / address / date of birth were not being redacted. Fixed and covered by a test — worth a note to whoever owns the clinical-case flow.

## K. Recommended next production step

1. Push `migration/agent-first-workspace` (from the bundle) and open a PR to `main` — do not merge yet. CI should go green: every step passed locally on this commit.
2. Vercel **Preview** for the PR with a Postgres database (`DATABASE_URL`, run `npm run db:migrate`), `NCBI_API_KEY`, `APP_ORIGIN` = preview URL.
3. Manual pass on the preview at 390 / 768 / 1440 and a clinical read of every snapshot claim by a cardiologist.
4. Merge to `main` only after 1–3; keep `/legacy` for one release, then remove the retired surfaces (E).
5. Next build-out, in order: weekly snapshot refresh job → ГРЛС connector → PDF parsing for uploads → Telegram public-preview connector → accounts.
