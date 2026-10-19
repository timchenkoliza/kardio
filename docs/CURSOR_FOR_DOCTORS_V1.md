# Cursor for Doctors v1 — cardiology reference architecture

## Product thesis

Kardio is not a feed, portal, or directory of medical sections. It is a professional intelligence workspace for physicians.

Primary loop:

`Intent -> Rules -> Sources -> Agent run -> Evidence -> Action -> Memory`

The physician states what matters once. The system keeps the instruction, connects allowed professional sources and tools, and returns a small number of evidence-grounded outputs that are ready to use.

## Cursor analogy

| Cursor primitive | Physician product primitive |
| --- | --- |
| Repository / project | Professional workspace / specialty context |
| Composer | Universal professional command box |
| Agent | Configured medical-information job |
| Rules | Persistent physician preferences, source policy and output rules |
| MCP / plugins | Connected professional sources, tools and approved partner channels |
| Codebase index | Searchable personal/professional knowledge context |
| Background agent | Scheduled monitor of topics, sources or changes |
| Diff | What changed in evidence/guidance since the previous state |
| Review | Physician verifies evidence and decides whether to act |
| Artifacts | Briefs, comparisons, saved materials, learning plans, monitoring reports |
| Cloud run | Long-running research/monitoring task |

The product should copy the BUSINESS LOGIC, not Cursor's visual appearance.

## Top-level information architecture

Primary navigation must be small:

1. **Главное** — command box, configured agents, latest outputs and next actions.
2. **Агенты** — create, edit, pause and review configured jobs.
3. **Материалы** — user-owned saved artifacts and uploads.
4. **Источники** — connected sources and source rules.
5. **Инструменты** — secondary toolbox, not the main product model.

Legacy destination pages (calculators, drugs, events, education, visualization, referral, consilium) must not define the information architecture. They become agent tools, connected destinations or experimental modules.

## Universal composer

One composer handles two modes:

- **Спросить сейчас** — one-off pull request.
- **Следить** — convert the same instruction into a persistent agent configuration.

Examples:

- `Следи за изменениями рекомендаций по ХСН у РКО и ESC и показывай только то, что меняет тактику.`
- `Раз в неделю собирай новые исследования по SGLT2, отделяй RCT/meta-analysis от observational data.`
- `Найди обучение по ФП только у выбранных профессиональных обществ.`
- `Сравни новые данные по двум стратегиям и покажи расхождения с текущими рекомендациями.`

## Agent contract

Every configured agent has an explicit contract:

- `intent` — what job the physician wants done;
- `instruction` — persistent natural-language rule;
- `topics` — medical scope;
- `sources` — allowed/required sources;
- `sourcePolicy` — first-party / professional society / peer reviewed / partner approved;
- `cadence` — manual, daily, weekly or event-driven intent;
- `outputFormat` — delta, brief, comparison, learning plan, watchlist;
- `evidencePolicy` — provenance required, primary source link required, uncertainty visible;
- `commercialPolicy` — independent or clearly sponsored;
- `status` — draft, configured, paused;
- `lastReviewedAt` — when the physician last reviewed the configuration.

A configured agent is not the same thing as a running background job. Until a scheduler/runtime exists, the UI must say **configured**, not **active monitoring**.

## Evidence model

Every generated output must keep:

- source identity;
- publication/update date when available;
- evidence type;
- what changed;
- why it may matter;
- uncertainty / limitations;
- link to primary source;
- commercial disclosure when applicable.

No answer should hide the distinction between observed source content and model-generated interpretation.

## Pharma model

Pharma is not a banner layer over editorial content. It is a separate plugin/channel class.

A partner channel may provide approved HCP content and a user can explicitly connect/follow it. The agent may summarize only the approved corpus for that channel.

Required separation:

- sponsor clearly visible;
- partner output visually and semantically separated from independent medical intelligence;
- no sponsor material silently injected into independent evidence ranking;
- approved-claim/source provenance required;
- legal/medical review status explicit;
- user can disconnect or mute the channel.

Synthetic partner examples are acceptable for prototype demonstration; real RX advertising requires a separate legal gate.

## Cardiology v1 agent templates

1. **Что изменилось в рекомендациях** — RKO/ESC guideline delta.
2. **Новые данные по терапии** — research watch with evidence hierarchy.
3. **Практика по теме** — action-oriented synthesis from selected professional sources.
4. **Обучение** — user-selected societies/courses/webinars assembled into a plan.
5. **События** — selected professional events with user-defined filters.
6. **Источник под наблюдением** — changes from one chosen source/channel.
7. **Партнёрский HCP-канал** — explicitly sponsored approved-content agent.

## What is not first-class in v1

- feed as a product primitive;
- oncology expansion;
- consilium as part of the pharma/demo story;
- diagnostic interpretation of images;
- DICOM anomaly detection;
- VMP/referral as a primary nav destination;
- generic reference directory as a primary nav destination;
- editorially hand-curated endless homepage.

These can exist as tools or later modules, but they must not drive navigation or business logic.

## Release gates

Before production promotion:

1. A physician can create a configured agent from one instruction.
2. The configuration preserves topics, sources, cadence and output rules.
3. Main page is `Главное`, not `Лента`.
4. Primary sidebar contains no feature zoo.
5. Sponsored content is an explicit connected channel, never disguised editorial content.
6. One-off query and persistent agent start from the same composer.
7. Existing calculators/materials/sources remain reachable as tools without dominating IA.
8. No UI claims that scheduled monitoring is running until the runtime actually exists.
