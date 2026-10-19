# Cursor for Doctors — cardiology reference architecture

## Product thesis

Kardio is not a feed, portal, or directory of medical sections. It is a professional intelligence Harness for physicians.

Primary loop:

`Intent -> Rules -> Context -> Agent run -> Evidence -> Artifact -> Review -> Memory`

The physician states what matters once. The system keeps the instruction, connects allowed professional sources and tools, and returns a small number of evidence-grounded outputs that are ready for physician review.

The full 2027 capability catalog and commercial contract live in `docs/CARDIOLOGY_HARNESS_2027.md`.

## Cursor analogy

| Cursor primitive | Physician product primitive |
| --- | --- |
| Repository / project | Professional workspace / specialty context |
| Composer | Universal professional command box |
| Agent | Configured medical-information or workflow job |
| Rules | Persistent physician preferences, source policy and output rules |
| MCP / plugins | Connected professional sources, clinical adapters, tools and approved partner channels |
| Codebase index | Searchable professional/user-owned context |
| Background agent | Scheduled monitor of topics, sources, signals or workflow changes |
| Diff | What changed in evidence/guidance/state since the previous reviewed state |
| Review | Physician verifies evidence and decides whether to act |
| Artifacts | Briefs, comparisons, saved materials, learning plans, monitoring reports and drafts |
| Cloud run | Long-running research/monitoring/workflow task |

The product copies the BUSINESS LOGIC, not Cursor's visual appearance.

## Top-level information architecture

Primary navigation stays small:

1. **Главное** — command box, configured agents, latest outputs and next actions.
2. **Агенты** — create, edit, pause and review configured jobs.
3. **Материалы** — user-owned saved artifacts and uploads.
4. **Источники** — connected sources and source rules.
5. **Инструменты** — secondary toolbox, not the main product model.

Legacy destination pages (calculators, drugs, events, education, visualization, referral, consilium) do not define the information architecture. They become agent tools, connected destinations or experimental modules.

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
- `sourcePolicy` — professional society / peer reviewed / regulator / partner-approved;
- `cadence` — manual, daily, weekly or event-driven intent;
- `outputFormat` — delta, brief, comparison, learning plan or watchlist;
- `evidencePolicy` — provenance required, primary source link required, uncertainty visible;
- `commercialPolicy` — independent or clearly sponsored;
- `dependencyPolicy` — ready, clinical connector required or validated medtech connector required;
- `status` — draft, configured, paused;
- `lastReviewedAt` — when the physician last reviewed the configuration.

A configured agent is not the same thing as a running background job. Until a scheduler/runtime exists, the UI says **configured**, not **active monitoring**.

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

No answer may hide the distinction between observed source content and model-generated interpretation.

## Harness capability model

The catalog is grouped into six families rather than exposed as dozens of top-level features:

1. **Знания и доказательства** — guidelines, research, trials, safety, regulation, sources and topic maps.
2. **Решения и второе мнение** — practical briefs, therapy comparisons, drug safety, calculators, consilium, second-opinion packs and referral navigation.
3. **Сигналы и мониторинг** — ECG, Echo, imaging, rhythm, HF, BP, lipids and device follow-up; clinical/regulated connectors required where applicable.
4. **Рабочий процесс** — pre-visit review, documentation, draft orders, inbox, follow-up, administrative documents, coding and quality/registry work.
5. **Исследования и развитие** — trial matching, Journal Club, learning, events, publications and presentations.
6. **Партнёрские форматы** — a separate commercial plane constrained by the current commercial proposal.

A new capability normally becomes an agent recipe, context adapter, tool, trigger, artifact renderer or review policy — not another navigation section.

## Pharma model

Pharma is not a banner layer over independent intelligence and not a generic `partner_channel` primitive for new configurations.

The current commercial contract contains exactly five product primitives:

1. **Статья** -> `partner_article`
2. **Полезное** -> `partner_useful`
3. **Медиа** -> `partner_media`
4. **Событие** -> `partner_event`
5. **Performance-продвижение** -> `partner_performance`

A combined commercial package may compose those five primitives. The current proposal does not define an additional sixth `спецпроект` format, so product code must not invent one without an updated approved commercial specification.

Required separation:

- sponsor clearly visible;
- partner output visually and semantically separated from independent medical intelligence;
- no sponsor material silently injected into independent evidence ranking;
- approved-claim/source provenance required;
- legal/medical review status explicit once the production commercial pipeline supports it;
- user can disconnect or mute partner content;
- performance affects distribution/campaign metrics only, never evidence ranking or clinical synthesis.

Synthetic partner examples are acceptable for prototype demonstration; real prescription-drug promotion requires a separate legal/compliance gate.

## Safety and connector gates

The Harness can expose future workflows before every connector exists, but it must not simulate unavailable capabilities.

- Professional-information agents may be configured against approved sources.
- Patient-context/workflow agents stay `draft` until an explicit clinical connector exists.
- ECG/Echo/imaging workflows require a validated external medical module and may only orchestrate its structured output.
- Diagnostic-image or signal workflows must never fall back to free-form interpretation when the required module is absent.
- Actions that write to external clinical systems require explicit physician confirmation and an action-capable connector.

## What is not a first-class product primitive

- feed as the core product model;
- endless editorial homepage;
- oncology expansion as a prerequisite for the cardiology reference architecture;
- free-form diagnostic interpretation of medical images;
- DICOM anomaly detection without a validated module;
- VMP/referral as a primary nav destination;
- generic reference directory as a primary nav destination;
- a generic undifferentiated sponsored channel.

These may exist as tools, adapters or later modules, but they do not drive navigation or business logic.

## Release gates

Before production promotion:

1. A physician can create a configured agent from one instruction.
2. The configuration preserves topics, sources, cadence and output rules.
3. Main page is `Главное`, not `Лента`.
4. Primary sidebar contains no feature zoo.
5. Sponsored content is limited to the explicit commercial formats and never disguised as independent editorial content.
6. One-off query and persistent agent start from the same composer.
7. Existing calculators/materials/sources remain reachable as tools without dominating IA.
8. No UI claims that scheduled monitoring is running until the runtime actually exists.
9. Connector-gated agents cannot execute without the connector they declare.
10. Independent evidence and commercial distribution remain technically isolated.
