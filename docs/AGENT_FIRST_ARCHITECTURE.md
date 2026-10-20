# Agent-first physician workspace — architecture

Status: implemented on branch `migration/agent-first-workspace` (2026-10-19). Product direction: `context/40_AGENT_FIRST_WORKSPACE.md`. Audit of the previous app: `CURRENT_APP_MAP.md`.

## 1. Hierarchy

```
USER        sees JOBS          Главное · Мои агенты · Мои материалы (+ Настройки)
  ↓
AGENTS      own GOALS          7 AgentDefinitions (lib/agents/definitions.ts)
  ↓
SUPERVISOR  hidden             route → plan → execute → validate → risk → approve → persist
  ↓
TOOLS       own CAPABILITIES   15 named tools (server/agents/tools.ts) over shared services
  ↓
CONNECTORS  own ACCESS         16 connectors with LIVE / MOCK / UNAVAILABLE (server/agents/connectors.ts)
```

Nothing below the agent layer is a navigation item. Sources, PubMed, РКО, Telegram, fact-check and risk-check appear only inside results (provenance, verification pill, "Как получен результат") and in Settings → «Источники и подключения».

## 2. Layout of the code

| Layer | Path | Responsibility |
| --- | --- | --- |
| Domain types | `lib/agents/types.ts` | `UserProfile`, `AgentDefinition`, `AgentSubscription`, `AgentPreference`, `AgentRun`, `AgentResult`, `Evidence`, `Provenance`, `Material`, `MaterialCollection`, `ActionRequest`, `ConnectorDescriptor`, `AgentCardState`, `WorkspaceView` |
| Agent catalogue | `lib/agents/definitions.ts` | job, goal, inputs, outputs, tools, sources, permissions, schedule, default preference, primary action |
| Vocabulary | `lib/agents/vocabulary.ts` | chip options: topics per specialty (with catalog topics, PubMed term, keyword stems), sources, content types, frequency, delivery, formats, horizons, learning goals |
| Policy (pure) | `lib/agents/intent.ts`, `risk-rules.ts`, `profile.ts`, `text.ts`, `format.ts`, `metrics.ts` | intent routing, risk signals, preference inheritance, newness, Cyrillic-safe text matching, product metrics |
| Connectors | `server/agents/connectors.ts`, `server/agents/adapters/pubmed.ts`, `server/agents/snapshots/*` | access + declared mode and data origin |
| Services | `server/agents/services/*` | Search, Evidence, FactCheck, Risk + Deidentification, GuidelineDiff, DrugChange, Event, Learning, Material, Partner, ActionConfirmation |
| Tools | `server/agents/tools.ts`, `drafts.ts` | `timedTool` wrapper records connector ids, modes, status and duration for the run trace |
| Executors | `server/agents/executors.ts` | one per agent; builds a user-language plan and drafts results |
| Supervisor | `server/agents/supervisor.ts` | `routeTask`, `selectAgent`, `createPlan`, `checkRisk`, `validateEvidence`, `requestApproval`, `mergeResults`, `runAgent` |
| Read models | `server/agents/workspace.ts` | `getWorkspaceView`, `getAgentDetail`, `getMaterialsView`, cards, highlights, catch-up |
| Commands | `server/agents/commands.ts` | zod-validated command union behind `POST /api/agents` |
| Persistence | `server/agents/store/*`, `db/agent-schema.ts`, `db/migrations/0004_agent_workspace.sql` | PostgreSQL store, memory store, cookie profile mirror |
| Telemetry | `server/agents/telemetry.ts`, `scripts/agent-metrics.ts` | 10 product events into `analytics_events`; aggregate metrics |
| UI | `app/[specialty]/(workspace)/*`, `components/workspace/*`, `app/styles/agent-workspace.css`, `--ws-*` tokens in `app/styles/tokens.css`, `public/brand/` | command center, agent pages, materials, settings — Yandex Med design system (see `context/40_AGENT_FIRST_WORKSPACE.md`, Visual system) |

## 3. Agents

| Agent | Kind | Default schedule | Main tools | Primary action |
| --- | --- | --- | --- | --- |
| Что нового для меня | monitoring | daily, 90 days horizon | searchMedical, searchPubmed, guidelineDiff, findDrugChanges, factCheck | Смотреть новое |
| Изменения рекомендаций | monitoring | weekly | guidelineDiff (catalog version chains + ESC snapshot), factCheck | Смотреть изменения |
| Препараты | monitoring | daily | findDrugChanges, searchPubmed, factCheck | Что изменилось |
| Исследовать тему | on demand | — | searchMedical, searchPubmed, searchUserMaterials, rankEvidence, factCheck | Задать вопрос |
| События | monitoring | weekly, 60 days | searchEvents (rank + reasons), prepare calendar/registration actions | Выбрать события |
| Моё обучение | on demand | re-planned on catch-up | generateLearningPlan over guidelines, lectures, events with НМО | Продолжить |
| Мои материалы | on demand | — | saveMaterial, indexUserMaterial, searchUserMaterials | Открыть материалы |

"Monitoring" agents (whats_new, guidelines, drugs, events) track `newSinceLastSeen`; research, learning and materials show a single list.

## 4. A run, end to end

1. **Input** — composer text or a scheduled/catch-up trigger. `checkInputRisk` de-identifies (surname after «пациент/больной», labelled ФИО / address / date of birth, phone, e-mail, СНИЛС, полис ОМС, passport), reframes prescribing requests into evidence questions, blocks image interpretation and emergencies with a fixed message.
2. **Route** — `routeIntent` scores rules per agent; the composer shows the chosen agent live; the user can override.
3. **Plan** — the executor emits steps in user language («Искали в каталоге РКО и РКЖ», «Проверили утверждения по источникам», «Чего не хватает»).
4. **Execute tools** — each tool call is timed and tagged with connector ids and modes; UNAVAILABLE connectors are reported as gaps, never simulated.
5. **Validate evidence** — `factCheck` per claim: provenance completeness, numeric consistency (numbers in the claim must appear in the quote), lexical support or a curated translated quote, downgrades for secondary sources, non-current guideline versions, derived claims and uncertain dates. Result status = weakest link. Unsupported organic results are dropped; editorial drafts are never evidence.
6. **Risk-check output** — directive wording («назначьте», «увеличьте дозу») is flagged; patient-specific advice is not produced.
7. **Approve** — anything outside the product becomes an `ActionRequest` in `pending_confirmation`; opening a source link is the only external step without confirmation.
8. **Persist** — results merge by stable key, so `createdAt` (first seen) survives re-runs; `newSinceLastSeen = createdAt > subscription.lastSeenAt`. `lastSeenAt` moves only when the user actually views the agent page (1.5 s `SeenMarker`).

## 5. Evidence object

```ts
Evidence {
  id, claim, sourceId, sourceUrl, sourceType, publicationDate, retrievedAt,
  evidenceLevel, confidence,              // confidence is model/heuristic confidence, never "probability of truth"
  verificationStatus: "SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNSUPPORTED" | "UNKNOWN",
  verificationNote, supportText,
  provenance: { source, url, publisher, retrievedAt, publishedAt, version, connectorId, mode, dataOrigin }
}
```

## 6. Integrations — honest modes

| Connector | Mode | Origin | Notes |
| --- | --- | --- | --- |
| Каталог РКО и РКЖ (Golden Set) | LIVE | catalog_snapshot | 54 objects, 18 sources, version chains |
| PubMed, профессиональные журналы | LIVE / UNAVAILABLE | runtime_api | NCBI E-utilities, 6 s timeout, 30 min cache; failure is reported as a gap |
| Рекомендации ESC | LIVE | curated_snapshot | 4 records with quotes, retrieved 2026-10-19 |
| Регуляторные изменения | LIVE | curated_snapshot | 9 records (RU/FDA registrations, boxed warning, studies), retrieved 2026-10-19 |
| Афиши событий | LIVE | curated_snapshot | 18 events (rnmo.ru, ESC, AHA), retrieved 2026-10-19 |
| Ваши документы | LIVE | user_content | TXT/MD/CSV/HTML/DOCX indexed; PDF metadata only; DICOM/images rejected |
| Календарь: файл .ics | LIVE | none | VEVENT + VALARM −1 day, −1 hour, after confirmation |
| Партнёрские материалы | MOCK | synthetic_fixture | labelled «Партнёрский материал», separate slot, off by toggle |
| ГРЛС, Портал НМО, Личный кабинет РКО, Telegram-каналы, Открытый веб, Запись в календарь, Почта | UNAVAILABLE | none | shown in Settings; agents hand off with a link or a draft |

`curated_snapshot` records are real public pages with URL and retrieval date. They are shown as «Снимок 19 окт.», not «Онлайн».

## 7. Actions outside the product

`ActionConfirmationService.prepareAction` → `ActionRequest{ status: pending_confirmation, requiresConfirmation, payload, preview }` → dialog «Нужно ваше подтверждение» → `confirmAction` → `completed | failed`.

| Action | What actually happens on confirm |
| --- | --- |
| Добавить в календарь (one or bulk) | `.ics` download with two reminders («будильник») |
| Письмо себе | `mailto:` draft opens in the user's mail client |
| Перейти к регистрации | opens the organiser's page; the dialog states the agent cannot register on the user's behalf |
| Открыть первоисточник | plain link, no confirmation |

`purchase` and `publishing` exist as action kinds but always resolve to `unavailable`; no command can prepare them.

## 8. Persistence

- **PostgreSQL** (when `DATABASE_URL` is set): `agent_profiles`, `agent_runs`, `agent_results` (unique `session_id, specialty, result_key`), `user_materials`, `material_collections`, `action_requests`; all `ON DELETE CASCADE` from `anonymous_sessions`. Migration `0004_agent_workspace.sql`.
- **No database** (current Vercel deployment): per-instance memory + `kardio_agents_<specialty>` HttpOnly cookie that mirrors interests, agent settings and last-seen marks (≤ 3.6 KB). A cold instance restores the profile and re-runs agents; the rehydration rule keeps restored findings from being shown as new. Materials and results are not durable in this mode — Settings says so.
- Isolation: every query is scoped by `session_id` + `specialty`; materials never enter shared search; uploaded text is never sent to the client except the owner's own excerpt.

## 9. Observability

Events: `agent_opened`, `agent_configured`, `agent_run_started`, `agent_run_completed`, `agent_result_opened`, `evidence_opened`, `material_saved`, `file_uploaded`, `action_started`, `action_completed`.
Metrics (`computeAgentMetrics`, `npm run agents:metrics`, `GET /api/agents/metrics` for the current session): task completion rate, useful action rate, evidence CTR, save rate, repeat agent usage, 7-day agent retention, successful external action rate, estimated minutes saved (per-agent constant per useful run — an estimate, labelled as such).

## 10. Extending

- **New connector** — add a `ConnectorDescriptor` with an honest mode and origin; implement an adapter that returns `{ status: "ok" | "unavailable" | "error" }`; never return fixtures from a LIVE connector.
- **New tool** — wrap with `timedTool`, declare connector ids; return drafts with evidence, not prose.
- **New agent** — add `AgentDefinition`, an executor with a `PlanBuilder`, intent rules, chip vocabulary; it inherits fact/risk gates and persistence from the supervisor.
- **New external action** — add an `ActionKind`, a preview and a confirm handler in `action-confirmation.ts`; the UI dialog is generic.
