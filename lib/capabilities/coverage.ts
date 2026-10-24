import type { AgentId } from "@/lib/agents/types";

/**
 * Capability coverage registry — the traceability table for the physician
 * scenario matrix «Сценарии пользователей» (sheet `23_10_2026`, rows 2–57).
 *
 *   source row → capability → agent → tools → connectors → sources → code → tests → status
 *
 * The registry is data, not UI. It is the single place that says what a
 * scenario is served by and how honestly: `LIVE` only when the full path
 * runs on a real source; `PARTIAL` when the path runs but part of the
 * scenario or its source is missing (the gap is named in `gaps`/`blockers`);
 * `MOCK` only for labelled synthetic data; `UNAVAILABLE` when nothing runs
 * yet, or must not run (boundary), with the reason in `blockers`.
 *
 * `tests/unit/capability-coverage.test.ts` checks that every source row is
 * traced, that every referenced file exists, and that the rendered matrix
 * (`docs/CAPABILITY_COVERAGE_MATRIX.md`, `npm run capabilities:matrix`) is in sync.
 */

export type CapabilityStatus = "LIVE" | "PARTIAL" | "MOCK" | "UNAVAILABLE";
export const CAPABILITY_STATUSES: readonly CapabilityStatus[] = ["LIVE", "PARTIAL", "MOCK", "UNAVAILABLE"];

/** Where the data behind a capability comes from, at its deepest working level. */
export type DataDepth = "runtime_api" | "public_pages" | "curated_snapshot" | "catalog_snapshot" | "user_content" | "deterministic_formula" | "handoff" | "none";

/** The seven physician-facing agents of the master prompt, plus the answer host and platform services. */
export type CapabilityOwner = AgentId | "platform";

export interface Capability {
  /** Stable capability_id. */
  id: string;
  /** Scenario code in the master prompt (A1…F3) or null for rows that are not numbered there. */
  scenario: string | null;
  title: string;
  /** What the physician gets. */
  outcome: string;
  /** Entry points (routes, inputs, buttons). */
  entry: string[];
  /** Agent that owns the goal (the host of runs and results). */
  agent: CapabilityOwner;
  /** Executors and services that run it. */
  executors: string[];
  tools: string[];
  connectors: string[];
  /** Sources in priority order, and the rule that orders them. */
  sources: string[];
  sourcePriority: string;
  statusBefore: CapabilityStatus;
  status: CapabilityStatus;
  depth: DataDepth;
  persistence: string;
  ui: string;
  risks: string[];
  /** Missing parts of the scenario that run today (for PARTIAL). */
  gaps: string[];
  /** External dependencies that block LIVE (keys, licences, agreements, product decisions). */
  blockers: string[];
  /** Implementation files (must exist). */
  code: string[];
  /** Test files that exercise it (must exist). */
  tests: string[];
  acceptance: string;
  /** What this branch changed for the capability. */
  changed: string | null;
}

export type RowDisposition = "implemented" | "merged" | "boundary" | "out_of_scope";

export interface SourceRow {
  /** Row number in the source spreadsheet (sheet `23_10_2026`). */
  row: number;
  theme: string;
  task: string;
  disposition: RowDisposition;
  capabilities: string[];
  note: string;
}

const RESEARCH_TESTS = ["tests/unit/agent-mvp-research.test.tsx", "tests/e2e/agent-mvp-research.spec.ts"];

export const CAPABILITIES: readonly Capability[] = [
  {
    id: "drugs.new_approvals", scenario: "A1", title: "Новые препараты и новые показания",
    outcome: "Новые регистрации и показания по темам врача с датой, источником и юрисдикцией (РФ / FDA / исследование)",
    entry: ["«Для вас» на главной", "/[specialty]/agents → «Что нового»", "строка ввода: «новые препараты при …»"],
    agent: "drugs", executors: ["server/agents/executors.ts (drugs)", "server/agents/services/drug-change.ts"], tools: ["findDrugChanges", "searchPubmed", "factCheck"],
    connectors: ["regulatory-news (curated_snapshot)", "pubmed (runtime_api)", "grls (UNAVAILABLE, ссылка)"],
    sources: ["Снимок регуляторных сообщений (РФ и FDA, дата сбора)", "PubMed (РКИ)", "ГРЛС — проверка по ссылке"],
    sourcePriority: "Официальная регистрация РФ выше зарубежной; исследование не выдаётся за регистрацию", statusBefore: "PARTIAL", status: "PARTIAL", depth: "curated_snapshot",
    persistence: "agent_results по ключу находки; createdAt — первое появление у врача", ui: "Карточки «Препараты» в «Для вас» и на странице агента",
    risks: ["Снимок устаревает: дата сбора показывается", "Только кардиология в снимке"],
    gaps: ["Нет живого потока регистраций РФ", "Снимок только по кардиологии"],
    blockers: ["Официальный канал данных ГРЛС (grls.rosminzdrav.ru) — нет API, нужен договор или выгрузка", "РЛС Aurora Web API — лицензия"],
    code: ["server/agents/services/drug-change.ts", "server/agents/snapshots/drug-changes.ts", "lib/agents/drug-change-assessment.ts"],
    tests: ["tests/unit/agent-evidence.test.ts", "tests/unit/drugs-v2-grls-gate.test.ts", "tests/e2e/agent-workspace.spec.ts"],
    acceptance: "Каждая находка имеет источник, дату получения и юрисдикцию; без подтверждения регистрация не утверждается", changed: null,
  },
  {
    id: "drugs.compare", scenario: "A2", title: "Сравнение двух–четырёх препаратов",
    outcome: "Таблица: одинаковые разделы инструкций рядом, пустые ячейки объяснены, разные формы и инструкции FDA помечены, ссылки на первоисточники",
    entry: ["строка ввода: «сравни X и Y», «чем отличаются X и Y», «X или Y»", "план для трёх и более препаратов («Я проверю…»)"],
    agent: "drugs", executors: ["server/mesh/executor.ts (evidenceAnswer, job drug_comparison)", "lib/mesh/compiler.ts (comparison)"], tools: ["readSource", "factCheck"],
    connectors: ["medi (public_pages)", "openfda-labels (runtime_api, замена)", "grls (ссылка)", "pubmed (обзоры, по желанию)"],
    sources: ["Копия российской инструкции (МЕДИ РУ)", "Инструкция FDA — только если российской нет, с границей применимости", "ГРЛС — официальный статус по ссылке"],
    sourcePriority: "Российская инструкция → инструкция FDA как замена; ни один источник не ранжирует препараты", statusBefore: "UNAVAILABLE", status: "LIVE", depth: "public_pages",
    persistence: "Прогон и манифест в agent_runs; документы — agent_results", ui: "Модуль «Сравнение» (таблица на десктопе, блоки на телефоне)",
    risks: ["МЕДИ РУ — вторичная копия: статус «частично подтверждено», сверка в ГРЛС", "Разные лекарственные формы — помечаются"],
    gaps: ["Проверка взаимодействий между препаратами — отдельный сценарий, не выполняется (нет лицензированной базы взаимодействий)"],
    blockers: ["Видаль / РЛС Aurora (interact) — лицензия для проверки взаимодействий", "Соглашение с МЕДИ РУ об автоматическом чтении (открытый вопрос в docs/INTENT_EVIDENCE_EXPERIENCE_ARCHITECTURE.md)"],
    code: ["lib/mesh/compiler.ts", "server/mesh/sources/medi.ts", "server/mesh/sources/openfda.ts", "components/experience/experience-view.tsx", "lib/portal/router.ts"],
    tests: ["tests/unit/drug-comparison.test.tsx", "tests/unit/skills-journey.test.ts", "tests/e2e/skills-flows.spec.ts"],
    acceptance: "Для 2–4 препаратов прочитана инструкция каждого; одинаковые разделы в одной строке; отсутствующие данные названы; без вердикта «лучше»",
    changed: "Новая задача drug_comparison; МЕДИ РУ и openFDA читают все препараты; реализован модуль «Сравнение»; план «Открою российские инструкции» стал правдой",
  },
  {
    id: "drugs.label_reference", scenario: "A3", title: "Официальная инструкция и безопасность препарата",
    outcome: "Разделы инструкции (показания, противопоказания, дозы, беременность, дети, взаимодействия) цитатой со ссылкой; уточнение формы при неоднозначности",
    entry: ["строка ввода с препаратом", "быстрая задача «Препарат»", "/[specialty]/ask?job=drug"],
    agent: "reference", executors: ["server/mesh/executor.ts (drug_reference)", "lib/mesh/skills/pediatrics (дети)"], tools: ["readSource", "lookupDrugLabel", "factCheck"],
    connectors: ["medi (public_pages)", "openfda-labels (runtime_api)", "grls (ссылка)", "regulatory-news (снимок)"],
    sources: ["Копия российской инструкции МЕДИ РУ", "Инструкция FDA — замена с границей", "ГРЛС по ссылке"],
    sourcePriority: "Российская инструкция выше зарубежной (STAND_IN в планировщике)", statusBefore: "PARTIAL", status: "PARTIAL", depth: "public_pages",
    persistence: "agent_runs + agent_results", ui: "Карточка препарата: ключевая информация, разделы, граница применимости",
    risks: ["Расчёт дозы для конкретного пациента запрещён границей продукта"],
    gaps: ["Расчёт дозы по массе/СКФ: только справочные формулы в калькуляторах, без подстановки в инструкцию", "Изображение упаковки и таблетки не показывается (нет лицензированного источника изображений)", "Официальный текст ГРЛС не читается автоматически"],
    blockers: ["Канал данных ГРЛС", "РЛС Aurora / Видаль — лицензия"],
    code: ["server/mesh/sources/medi.ts", "server/mesh/sources/openfda.ts", "lib/mesh/clarification.ts", "components/experience/experience-view.tsx"],
    tests: ["tests/unit/mesh-sources.test.ts", "tests/unit/clarification-session.test.ts", "tests/e2e/product-surface.spec.ts"],
    acceptance: "Цитата раздела + ссылка + граница юрисдикции; при неоднозначном запросе один уточняющий вопрос", changed: null,
  },
  {
    id: "drugs.safety_watchlist", scenario: "A4", title: "Мои препараты: изменения безопасности и регуляторные оповещения",
    outcome: "Список до 30 препаратов; оповещение только о подтверждённом изменении с документом регулятора и датой (отзыв серий, изменение инструкции); раз в месяц — «изменений не найдено» с перечнем проверенных источников",
    entry: ["кнопка «Следить» на карточке препарата и в сравнении", "Настройки → «Мои препараты»", "фоновая проверка по расписанию"],
    agent: "drugs", executors: ["server/agents/executors.ts (drugs)", "server/agents/services/drug-watch.ts", "server/agents/scheduler.ts"], tools: ["findDrugChanges (checkWatchlist)"],
    connectors: ["openfda-enforcement (runtime_api)", "openfda-labels (runtime_api)", "regulatory-news (curated_snapshot)", "roszdravnadzor (UNAVAILABLE)", "grls (UNAVAILABLE, ссылка)"],
    sources: ["FDA Enforcement Report (отзывы серий, США)", "Инструкции FDA: раздел «Недавние изменения»", "Снимок регуляторных сообщений (РФ / FDA / ЕС)", "Росздравнадзор и ГРЛС — проверка по ссылке"],
    sourcePriority: "Документ регулятора с датой обязателен; США помечены как рынок США; упоминание без документа оповещением не становится", statusBefore: "PARTIAL", status: "PARTIAL", depth: "runtime_api",
    persistence: "profile.watchlist (agent_profiles); находки — agent_results по ключу; история проверок — agent_schedule_slots", ui: "Карточки «Препараты»; «Следить»; Настройки → «Мои препараты»",
    risks: ["Отзыв в США не означает отзыва в России — сказано в каждой карточке", "Без OPENFDA_API_KEY лимит 1000 запросов в сутки на сервис"],
    gaps: ["Решения Росздравнадзора и статус ГРЛС не проверяются автоматически — это главное для российской практики", "Список ограничен препаратами словаря (около 150 МНН)"],
    blockers: ["Росздравнадзор: машиночитаемый канал писем о качестве ЛС", "ГРЛС — канал данных", "OPENFDA_API_KEY для объёма production"],
    code: ["server/agents/services/drug-watch.ts", "server/agents/adapters/openfda-enforcement.ts", "components/workspace/watchlist-settings.tsx", "components/portal/result-actions.tsx"],
    tests: ["tests/unit/drug-watch.test.ts", "tests/integration/scheduler.test.ts"],
    acceptance: "Оповещение только с документом и датой; недоступный источник не превращается в «изменений нет»; находки сохраняются при временном отказе источника",
    changed: "Новый список «Мои препараты» (до 30), отзывы и изменения инструкций FDA онлайн, ежемесячная сводка «изменений не найдено», перенос прежних находок при отказе источника",
  },
  {
    id: "research.literature_review", scenario: "B1", title: "Реферат и обзор литературы",
    outcome: "План, таблица ключевых исследований, список литературы по ГОСТ, ограничения; экспорт",
    entry: ["/[specialty]/agents/research", "строка ввода с вопросом о доказательствах", "фоновый режим «Академическая основа»"],
    agent: "research", executors: ["server/agents/research-run.ts", "server/agents/research-jobs.ts"], tools: ["searchPubmed", "readAbstracts", "rankEvidence", "factCheck"],
    connectors: ["pubmed (runtime_api)", "catalog (catalog_snapshot)"], sources: ["PubMed (одобренные врачами журналы)", "Каталог специальности"],
    sourcePriority: "Систематические обзоры и РКИ выше; журналы из списка врачей первыми", statusBefore: "PARTIAL", status: "PARTIAL", depth: "runtime_api",
    persistence: "agent_runs + agent_results; фоновые задания research_jobs", ui: "Страница сценария «Разбор по исследованиям», экспорт",
    risks: ["Нет слоя русскоязычного синтеза — текст реферата не генерируется; выводы авторов на языке оригинала"],
    gaps: ["Связный текст реферата по разделам не создаётся (модели в контуре нет)", "Пресеты «доклад / аттестация / клинразбор / конспект» не реализованы"],
    blockers: ["Решение команды о слое синтеза (модель) с проверкой утверждений"],
    code: ["server/agents/research-run.ts", "lib/agents/research-citations.ts", "app/api/agents/research/export/route.ts"],
    tests: ["tests/unit/research-citations.test.ts", ...RESEARCH_TESTS],
    acceptance: "Каждое утверждение со ссылкой; список литературы по ГОСТ; экспорт открывается в Word", changed: null,
  },
  {
    id: "materials.fragment_question", scenario: "B2", title: "Вопрос к фрагменту материала",
    outcome: "Ответ рядом с выделенным фрагментом со ссылкой на место в документе; граница «из документа / общие знания»",
    entry: ["просмотр материала → выделение → «Спросить»"], agent: "materials", executors: [], tools: ["searchUserMaterials"], connectors: ["user-uploads"],
    sources: ["Текст открытого документа"], sourcePriority: "Только документ; внешние источники — отдельным блоком", statusBefore: "UNAVAILABLE", status: "UNAVAILABLE", depth: "none",
    persistence: "—", ui: "—", risks: ["Без синтеза ответ — только поиск связанных мест"], gaps: [],
    blockers: ["Нет просмотрщика документа с выделением", "Нет слоя объяснения (модель) — решение команды"],
    code: ["server/agents/services/material.ts"], tests: ["tests/unit/agent-materials-commands.test.ts"],
    acceptance: "Ответ ссылается на страницу/раздел документа; внешнее знание отделено", changed: null,
  },
  {
    id: "materials.answer_from_own", scenario: "B3", title: "Ответы по собственным материалам",
    outcome: "Ответ только по загруженным файлам с цитатой и координатами; если в материалах нет ответа — так и сказано",
    entry: ["/[specialty]/materials", "строка ввода: «в моих материалах …»", "прикреплённый файл"], agent: "materials",
    executors: ["server/agents/executors.ts (materials)", "server/agents/services/material.ts"], tools: ["indexUserMaterial", "searchUserMaterials"], connectors: ["user-uploads (user_content)"],
    sources: ["Файлы и заметки врача"], sourcePriority: "Только материалы владельца; внешние источники не подмешиваются", statusBefore: "PARTIAL", status: "PARTIAL", depth: "user_content",
    persistence: "user_materials (PostgreSQL), изоляция по сессии и специальности", ui: "«Мои материалы»: загрузка, ответ со ссылкой на документ",
    risks: ["Персональные медицинские данные: маскировка не гарантирует допустимость"],
    gaps: ["PDF: только метаданные, текст не извлекается", "Режим «мои + внешние» с разделением не реализован", "Номера страниц не сохраняются"],
    blockers: ["Библиотека извлечения текста PDF с координатами страниц (решение о зависимости)"],
    code: ["server/agents/services/material.ts", "app/api/agents/materials/upload/route.ts"], tests: ["tests/unit/agent-materials-commands.test.ts", "tests/integration/agent-store.test.ts", "tests/e2e/agent-workspace.spec.ts"],
    acceptance: "Цитата совпадает с текстом файла; чужие материалы недоступны; нет ответа — честное «не найдено»", changed: null,
  },
  {
    id: "materials.search_library", scenario: "B4", title: "Поиск по сохранённым и загруженным материалам",
    outcome: "Совпадения с фрагментом, названием, датой и переходом к оригиналу; фильтры по типу и дате",
    entry: ["/[specialty]/materials (поиск)", "строка ввода: «найди в сохранённом …»"], agent: "materials",
    executors: ["server/agents/services/material.ts"], tools: ["searchUserMaterials"], connectors: ["user-uploads (user_content)"],
    sources: ["Материалы, ссылки, заметки и сохранённые результаты владельца"], sourcePriority: "—", statusBefore: "PARTIAL", status: "PARTIAL", depth: "user_content",
    persistence: "user_materials", ui: "«Мои материалы»", risks: [],
    gaps: ["Лексический поиск, не смысловой", "PDF не индексируется", "Нет номера страницы"], blockers: ["Извлечение текста PDF"],
    code: ["server/agents/services/material.ts", "components/workspace/materials-workspace.tsx"], tests: ["tests/unit/agent-materials-commands.test.ts", "tests/e2e/product-surface.spec.ts"],
    acceptance: "Поиск находит заметку, ссылку, сохранённый ответ; только своё", changed: null,
  },
  {
    id: "info.journal_subscriptions", scenario: "B5", title: "Подписки на журналы и источники",
    outcome: "Новые выпуски выбранных журналов: «3 статьи для вас» с объяснением, остальное свёрнуто; честная глубина (аннотация / полный текст)",
    entry: ["Настройки → источники (Приоритет / Не использовать)"], agent: "whats_new", executors: ["server/agents/executors.ts (whats_new)"], tools: ["searchPubmed"], connectors: ["pubmed (runtime_api)"],
    sources: ["PubMed по журналам из настроек"], sourcePriority: "«Приоритет» упорядочивает, не фильтрует (PR #27)", statusBefore: "PARTIAL", status: "PARTIAL", depth: "runtime_api",
    persistence: "Профиль (trustedSources)", ui: "Настройки источников", risks: ["Платные журналы: только аннотация"],
    gaps: ["Нет подписки на конкретный журнал с выдачей по выпускам", "Нет «добавить свой источник по ссылке»"], blockers: [],
    code: ["lib/mesh/source-preferences.ts", "lib/agents/vocabulary.ts"], tests: ["tests/unit/mesh-source-preferences.test.ts"],
    acceptance: "Подборка по выбранным журналам с датой и глубиной доступа", changed: "PR #27 интегрирован: приоритет и исключение источников действуют на пути ответа",
  },
  {
    id: "materials.knowledge_base", scenario: "B6", title: "Личная база знаний",
    outcome: "Темы → карточки (заметка, фрагмент, сохранённый ответ) с источником и датой; поиск и вопросы по базе; пометка устаревшей редакции",
    entry: ["кнопка «Сохранить» на результатах", "/[specialty]/materials (коллекции, заметки)"], agent: "materials",
    executors: ["server/agents/services/material.ts"], tools: ["saveMaterial", "searchUserMaterials"], connectors: ["user-uploads"],
    sources: ["Сохранённое врачом"], sourcePriority: "Сохранённый текст не становится достоверным источником", statusBefore: "PARTIAL", status: "PARTIAL", depth: "user_content",
    persistence: "user_materials, material_collections", ui: "«Мои материалы»: коллекции", risks: [],
    gaps: ["Нет автосборки конспекта темы", "Нет пометки «опирается на устаревшую редакцию КР»"], blockers: ["Конспект требует слоя синтеза"],
    code: ["server/agents/services/material.ts", "components/workspace/materials-workspace.tsx"], tests: ["tests/unit/agent-materials-commands.test.ts", "tests/integration/agent-store.test.ts"],
    acceptance: "Сохранение из любого результата, коллекции, поиск; у карточки источник и дата", changed: null,
  },
  {
    id: "evidence.cross_check", scenario: "B7", title: "Сверка нескольких независимых источников",
    outcome: "Позиции источников рядом; расхождения показаны, не разрешены; российские КР отдельно и первыми",
    entry: ["строка ввода (справочный ответ)", "галерея «Консилиум» → ответ по источникам"], agent: "reference",
    executors: ["server/mesh/executor.ts", "lib/mesh/evidence-graph.ts (conflicts)"], tools: ["readSource", "factCheck"], connectors: ["medi", "pubmed", "esc-guidelines (снимок)", "catalog"],
    sources: ["КР РФ (копия МЕДИ РУ / каталог РКО)", "Рекомендации обществ", "Обзоры PubMed"], sourcePriority: "Российские рекомендации первыми; конфликт не разрешается продуктом", statusBefore: "PARTIAL", status: "PARTIAL", depth: "public_pages",
    persistence: "Граф доказательств в прогоне", ui: "Модуль «Где источники расходятся»", risks: ["Копии одной публикации не считаются независимыми — нет дедупликации по первоисточнику"],
    gaps: ["Нет табличного режима «источник — позиция — год — уровень — цитата»", "Нет режима «Сверить источники» как отдельной кнопки"], blockers: [],
    code: ["lib/mesh/evidence-graph.ts", "components/experience/experience-view.tsx"], tests: ["tests/unit/mesh-experience.test.ts", "tests/e2e/mesh-acceptance.spec.ts"],
    acceptance: "Конфликт показан со ссылками на обе стороны", changed: null,
  },
  {
    id: "evidence.currentness_check", scenario: "B8", title: "Актуальность документа и утверждения",
    outcome: "Действует ли документ, какая редакция, когда пересмотр, что изменилось; без вывода «устарело» только по дате",
    entry: ["строка ввода: «это актуально?», «что изменилось в рекомендациях»"], agent: "guidelines",
    executors: ["server/mesh/executor.ts (guideline_check)", "lib/mesh/flows/guideline-change.ts"], tools: ["readSource", "guidelineDiff"], connectors: ["medi", "catalog", "cr-rubricator (ссылка)"],
    sources: ["Копия КР на МЕДИ РУ (цикл пересмотра)", "Каталог РКО (версии)", "Рубрикатор Минздрава — по ссылке"], sourcePriority: "Юридическая актуальность ≠ научная; статус в РФ не утверждается без рубрикатора", statusBefore: "PARTIAL", status: "PARTIAL", depth: "public_pages",
    persistence: "Версии документов в графе; знание с повторной проверкой", ui: "Модуль «Рекомендации и их версии»", risks: [],
    gaps: ["Нет проверки приказов и нормативных документов", "Нет сравнения для вставленной ссылки/документа"], blockers: ["Официальный канал рубрикатора КР (cr.minzdrav.gov.ru)"],
    code: ["lib/mesh/flows/guideline-change.ts", "server/mesh/knowledge.ts"], tests: ["tests/unit/mesh-incremental.test.ts", "tests/unit/flows-refine.test.ts"],
    acceptance: "Пересмотр просрочен — сказано словами; статус в РФ — только по ссылке", changed: null,
  },
  {
    id: "research.study_appraisal", scenario: "B9", title: "Критический разбор исследования",
    outcome: "По PMID/DOI/ссылке: дизайн, популяция, вмешательство, конечная точка, эффект только с цитатой, вывод авторов, первоисточник",
    entry: ["строка ввода с PMID, DOI или ссылкой PubMed", "страница сценария «Разбор по исследованиям»"], agent: "research",
    executors: ["server/agents/research-run.ts", "lib/agents/research-study-normalization.ts"], tools: ["searchPubmed", "readAbstracts"], connectors: ["pubmed (runtime_api)", "pmc (полный текст, если открыт)"],
    sources: ["PubMed / PMC"], sourcePriority: "Текст статьи; вывод авторов отделён от интерпретации", statusBefore: "UNAVAILABLE", status: "PARTIAL", depth: "runtime_api",
    persistence: "agent_runs + agent_results", ui: "Компактный ответ: что нашли, почему доверять, ограничения, первоисточник", risks: ["Регулярные выражения находят не все параметры"],
    gaps: ["NNT и абсолютные эффекты не вычисляются", "Загруженный PDF статьи не разбирается", "Финансирование/конфликт интересов — только если есть в тексте"], blockers: [],
    code: ["lib/agents/research-answer.ts", "lib/agents/study-identifiers.ts", "server/agents/research-run.ts"], tests: RESEARCH_TESTS,
    acceptance: "Ни одного числа эффекта без цитаты (PR #26)", changed: "PR #26 интегрирован",
  },
  {
    id: "news.general_digest", scenario: "B10", title: "Общие медицинские новости",
    outcome: "Дайджест: решения Минздрава, ОМС, НМО, аккредитация — официальное отдельно от новостей и мнений",
    entry: ["—"], agent: "whats_new", executors: [], tools: [], connectors: ["telegram (UNAVAILABLE)", "web (UNAVAILABLE)"],
    sources: [], sourcePriority: "Официальное → подтверждённые новости → мнения", statusBefore: "UNAVAILABLE", status: "UNAVAILABLE", depth: "none",
    persistence: "—", ui: "—", risks: ["Без подтверждённого источника дайджест превратится в пересказ слухов"], gaps: [],
    blockers: ["Нет утверждённого источника официальных решений (publication.pravo.gov.ru — без API для подборки по теме)", "Условия использования новостных СМИ (Медвестник и др.) не согласованы"],
    code: ["server/agents/connectors.ts"], tests: ["tests/e2e/agent-workspace.spec.ts"],
    acceptance: "Не показывается, пока нет источника", changed: null,
  },
  {
    id: "reference.nosology", scenario: "B11", title: "Справка по нозологии",
    outcome: "Определение, классификация, диагностика, лечение по структуре КР со ссылками на разделы; кратко или подробно",
    entry: ["строка ввода: «что такое …», «распиши по плану»"], agent: "reference", executors: ["server/mesh/executor.ts (disease_reference)"], tools: ["readSource"], connectors: ["medi", "pubmed"],
    sources: ["Копия КР на МЕДИ РУ", "Обзоры PubMed"], sourcePriority: "КР РФ первыми", statusBefore: "PARTIAL", status: "PARTIAL", depth: "public_pages",
    persistence: "agent_runs", ui: "Справочный ответ", risks: ["Не по специальности: границы применимости"],
    gaps: ["Только раздел «Определение» и раздел подтипа; полная структура КР не собирается", "Покрытие доменного графа — 12 нозологий"], blockers: ["Канал рубрикатора КР"],
    code: ["server/mesh/sources/medi.ts", "lib/mesh/domain-graph.ts"], tests: ["tests/unit/mesh-sources.test.ts"],
    acceptance: "Каждый раздел со ссылкой и редакцией", changed: null,
  },
  {
    id: "feed.specialty_stream", scenario: "B12", title: "Профильный поток «Для вас»",
    outcome: "Подборка по специальности и темам: КР, исследования, препараты, события; без дублей; «с прошлого визита»",
    entry: ["главная → «Для вас»"], agent: "whats_new", executors: ["server/portal/for-you.ts", "server/agents/home-feed.ts"], tools: ["searchPubmed", "guidelineDiff", "findDrugChanges", "searchEvents"],
    connectors: ["pubmed", "catalog", "esc-guidelines", "regulatory-news", "events-listings"], sources: ["Результаты фоновых проверок"], sourcePriority: "Новое с прошлого визита первым", statusBefore: "PARTIAL", status: "PARTIAL", depth: "runtime_api",
    persistence: "agent_results; lastSeenAt", ui: "Карточки «Для вас»", risks: [],
    gaps: ["Источники кроме PubMed — снимки с датой сбора", "Периодичность подборки задаётся частотой агентов, отдельной настройки нет"], blockers: ["Фоновые проверки на сервере требуют PostgreSQL и CRON_SECRET; иначе — догоняющая проверка при открытии"],
    code: ["server/portal/for-you.ts", "server/agents/workspace.ts", "server/agents/scheduler.ts", "app/api/cron/agents/route.ts"], tests: ["tests/unit/home-feed.test.ts", "tests/unit/portal-honesty.test.ts", "tests/unit/schedule-rules.test.ts", "tests/integration/scheduler.test.ts", "tests/e2e/portal-journey.spec.ts"],
    acceptance: "Каждая карточка: что это, почему здесь, источник, дата; фоновые проверки идут без открытой вкладки и не дублируются",
    changed: "Планировщик вне вкладки: Vercel Cron → аренда записей (SKIP LOCKED) → слот на агента в сутки/неделю → ограниченные повторы; пауза в настройках; при отказе источника прежние находки сохраняются",
  },
  {
    id: "evidence.method_evidence_base", scenario: "B13", title: "Доказательная база метода",
    outcome: "Типы и качество доказательств, ключевые работы, позиция КР РФ и международных рекомендаций; «исследований не найдено» — тоже ответ",
    entry: ["строка ввода: «какая доказательная база у …»"], agent: "research", executors: ["server/agents/research-run.ts", "server/mesh/executor.ts"], tools: ["searchPubmed", "readAbstracts"], connectors: ["pubmed"],
    sources: ["Систематические обзоры и метаанализы PubMed", "КР"], sourcePriority: "Метаанализы → РКИ; уровень доказательности только из источника", statusBefore: "PARTIAL", status: "PARTIAL", depth: "runtime_api",
    persistence: "agent_runs", ui: "Разбор по исследованиям; «Уверенность авторов»", risks: ["Уровень УДД/УУР не выдумывается"],
    gaps: ["Нет сводной шкалы «сильные / ограниченные / нет / есть данные о неэффективности»"], blockers: [],
    code: ["server/agents/research-run.ts", "lib/presentation/physician.ts"], tests: RESEARCH_TESTS,
    acceptance: "Уровень доказательств — только словами авторов или КР", changed: null,
  },
  {
    id: "reference.prevention", scenario: "B14", title: "Профилактика: скрининг, диспансеризация, вакцинация",
    outcome: "Чек-лист со ссылкой на действующий официальный документ и областью применимости",
    entry: ["строка ввода"], agent: "reference", executors: ["server/mesh/executor.ts (reference_answer)"], tools: ["readSource"], connectors: ["pubmed"],
    sources: ["Обзоры PubMed"], sourcePriority: "Официальный документ РФ должен быть первым — не подключён", statusBefore: "PARTIAL", status: "PARTIAL", depth: "runtime_api",
    persistence: "agent_runs", ui: "Справочный ответ", risks: ["Календарь прививок и порядок диспансеризации без официального документа — нельзя"],
    gaps: ["Национальный календарь прививок и порядок диспансеризации не подключены как документы"], blockers: ["Официальные тексты приказов (publication.pravo.gov.ru) — нужен редакционный снимок с датой и проверкой"],
    code: ["server/mesh/executor.ts"], tests: ["tests/unit/portal-honesty.test.ts"],
    acceptance: "Каждая схема — со ссылкой на действующий документ", changed: null,
  },
  {
    id: "reference.norms_calculators", scenario: "B15", title: "Нормы, шкалы и калькуляторы",
    outcome: "Калькулятор: формула, единицы, входные данные, область применимости, источник; без выдуманного результата",
    entry: ["/[specialty]/tools", "галерея «Калькуляторы» (все специальности)"], agent: "reference", executors: ["components/portal/calculators.tsx", "lib/calculators/formulas.ts"], tools: [], connectors: [],
    sources: ["CKD-EPI 2021 (Inker, NEJM 2021; NKF)", "Кокрофт–Голт (Nephron 1976)", "Шварц у детей (JASN 2009)", "ИМТ — ВОЗ", "ППТ — Мостеллер (NEJM 1987)", "Шкала комы Глазго (Lancet 1974)", "HOMA-IR (Diabetologia 1985)", "ПДР по менструации — ACOG № 700", "CHA₂DS₂-VA и HAS-BLED — ESC 2024", "Категории СКФ — KDIGO 2024"],
    sourcePriority: "Опубликованная формула и первоисточник; продукт не подменяет порог из инструкции препарата", statusBefore: "PARTIAL", status: "LIVE", depth: "deterministic_formula",
    persistence: "Не сохраняется; расчёт в браузере", ui: "Страница «Калькуляторы»: свои для специальности первыми, остальные — «Другие калькуляторы»; под каждым формула, применимость и источник",
    risks: ["Ошибка формулы = ошибка врача: каждая формула закреплена примерами, посчитанными по опубликованному уравнению", "Вне диапазона, для которого выведена формула, результата нет — объяснено почему"],
    gaps: ["Референсные значения анализов не приводятся: зависят от метода и лаборатории", "Нет калькуляторов, требующих лицензированных шкал или длинных опросников (NIHSS, SCORE2 — таблицы ESC)"],
    blockers: [],
    code: ["lib/calculators/formulas.ts", "lib/calculators/catalog.ts", "components/portal/calculators.tsx", "app/[specialty]/(workspace)/tools/page.tsx", "lib/ui/clinical-calculators.ts"],
    tests: ["tests/unit/calculators.test.ts", "tests/unit/clinical-calculators.test.ts", "tests/unit/product-surface.test.ts"],
    acceptance: "Формула и источник видны; при пустых входных данных результат не показывается",
    changed: "Калькуляторы для всех семи специальностей: СКФ CKD-EPI 2021, Кокрофт–Голт, Шварц, ИМТ, ППТ, Глазго, HOMA-IR, срок и ПДР; отказ вне диапазона применимости; единицы мкмоль/л и мг/дл",
  },
  {
    id: "documents.forms_regulations", scenario: "C1", title: "Медицинские формы и нормативные документы",
    outcome: "Актуальная форма по номеру с реквизитами приказа и статусом; шаблон без фиктивных значений; разбор документа",
    entry: ["—"], agent: "reference", executors: [], tools: [], connectors: [], sources: [], sourcePriority: "Официальная публикация приказа", statusBefore: "UNAVAILABLE", status: "UNAVAILABLE", depth: "none",
    persistence: "—", ui: "—", risks: ["Устаревшая форма → риск при экспертизе"], gaps: [],
    blockers: ["Нет подключённого официального источника форм (publication.pravo.gov.ru, КонсультантПлюс — лицензия)", "Интеграция с МИС не входит в продукт"],
    code: ["docs/PRODUCT_OPPORTUNITY_MAP.md"], tests: ["tests/unit/portal-routing.test.ts"],
    acceptance: "Не рекламируется, пока нет источника (карта возможностей)", changed: null,
  },
  {
    id: "context.topic_research_alerts", scenario: "D1", title: "Новые исследования по моим темам",
    outcome: "Подборка свежих работ по темам врача с типом исследования и ссылкой; «интересно / не то» влияет на следующие подборки",
    entry: ["Настройки → темы", "«Для вас»"], agent: "whats_new", executors: ["server/agents/executors.ts (whats_new)"], tools: ["searchPubmed", "rankEvidence"], connectors: ["pubmed (runtime_api)"],
    sources: ["PubMed по темам врача"], sourcePriority: "Систематические обзоры и РКИ выше", statusBefore: "PARTIAL", status: "PARTIAL", depth: "runtime_api",
    persistence: "Профиль (темы), agent_results", ui: "«Для вас»", risks: [],
    gaps: ["Нет обратной связи «интересно / не то»", "Тема — из словаря, не свободным текстом"], blockers: [],
    code: ["server/agents/executors.ts", "lib/agents/vocabulary.ts"], tests: ["tests/unit/agent-supervisor.test.ts", "tests/unit/home-feed.test.ts"],
    acceptance: "Только новые работы с прошлого визита; дубли убраны", changed: null,
  },
  {
    id: "context.guideline_changes", scenario: "D2", title: "Изменения клинических рекомендаций по моим темам",
    outcome: "«Было → стало» по разделам, даты утверждения и применения; «изменений нет» — тоже результат",
    entry: ["быстрая задача «Клинические рекомендации»", "«Для вас»"], agent: "guidelines", executors: ["server/agents/services/guideline-diff.ts", "lib/mesh/flows/guideline-change.ts"], tools: ["guidelineDiff", "readSource"],
    connectors: ["catalog (catalog_snapshot)", "esc-guidelines (curated_snapshot)", "medi (public_pages)", "cr-rubricator (ссылка)"], sources: ["Каталог РКО с цепочками версий", "Снимок ESC", "Копия КР на МЕДИ РУ"],
    sourcePriority: "Новая версия первой; официальный статус — рубрикатор по ссылке", statusBefore: "PARTIAL", status: "PARTIAL", depth: "catalog_snapshot",
    persistence: "agent_results; знание с fingerprint разделов", ui: "Модуль «Рекомендации и их версии»", risks: [],
    gaps: ["Полноценное сравнение версий — только для кардиологии (каталог)", "Нет ежемесячной сводки «по вашим КР без изменений»"], blockers: ["Канал рубрикатора КР"],
    code: ["server/agents/services/guideline-diff.ts", "lib/agents/guideline-version-diff.ts"], tests: ["tests/unit/guideline-version-diff.test.ts", "tests/unit/guidelines-v2-runtime.test.ts"],
    acceptance: "Изменение со ссылкой на раздел и датой", changed: null,
  },
  {
    id: "context.tools_catalog", scenario: "D3", title: "Каталог профессиональных инструментов",
    outcome: "Инструменты по специальности: назначение, доступ, язык, ограничения, официальная ссылка; встроенные функции Kardio отдельно",
    entry: ["/[specialty]/agents (галерея встроенных функций)"], agent: "reference", executors: ["lib/portal/agents-gallery.ts"], tools: [], connectors: [],
    sources: ["Описание встроенных функций"], sourcePriority: "—", statusBefore: "PARTIAL", status: "PARTIAL", depth: "none",
    persistence: "—", ui: "Галерея агентов", risks: ["Нельзя заявлять проверенную безопасность стороннего инструмента"],
    gaps: ["Сторонние инструменты не каталогизированы"], blockers: ["Редакционный каталог инструментов с проверенными ссылками и условиями доступа"],
    code: ["lib/portal/agents-gallery.ts"], tests: ["tests/e2e/product-surface.spec.ts"],
    acceptance: "Каждая запись — официальная ссылка и дата проверки", changed: null,
  },
  {
    id: "events.search", scenario: "E1", title: "Поиск профессиональных событий",
    outcome: "Конференции и школы по специальности: организатор, формат, даты, ссылка, состояние проверки; сохранение и файл .ics",
    entry: ["строка ввода: «конференции …»", "/[specialty]/ask?job=events"], agent: "events", executors: ["server/agents/services/event.ts"], tools: ["searchEvents"],
    connectors: ["events-listings (curated_snapshot)", "calendar-ics (LIVE, после подтверждения)", "nmo-portal (UNAVAILABLE)"], sources: ["Снимок афиш (rnmo.ru, ESC, AHA) с датой сбора", "Ссылки на организаторов для других специальностей"],
    sourcePriority: "Страница организатора — первоисточник", statusBefore: "PARTIAL", status: "PARTIAL", depth: "curated_snapshot",
    persistence: "agent_results; action_requests (календарь)", ui: "Список событий, подтверждение календаря", risks: ["Снимок устаревает"],
    gaps: ["События есть только для кардиологии; остальные специальности — ссылки на организаторов"], blockers: ["Канал данных афиш (портал НМО, профобщества)"],
    code: ["server/agents/services/event.ts", "server/agents/snapshots/events.ts", "app/api/agents/actions/[id]/ics/route.ts"], tests: ["tests/unit/agent-evidence.test.ts", "tests/e2e/portal-journey.spec.ts", "tests/e2e/agent-workspace.spec.ts"],
    acceptance: "Без выдуманных дат, организаторов и баллов; .ics только после подтверждения", changed: null,
  },
  {
    id: "events.nmo_plan", scenario: "E2", title: "События с баллами НМО и личный план",
    outcome: "Мероприятия с баллами (только подтверждённые), личный план «хочу набрать N баллов», отметки выполнения",
    entry: ["—"], agent: "events", executors: ["server/agents/services/event.ts"], tools: ["searchEvents"], connectors: ["events-listings (curated_snapshot)", "nmo-portal (UNAVAILABLE)"],
    sources: ["Листинг аккредитованных мероприятий (без числа баллов)"], sourcePriority: "Число баллов — только со страницы организатора или портала НМО", statusBefore: "PARTIAL", status: "PARTIAL", depth: "curated_snapshot",
    persistence: "—", ui: "Метка «НМО» на событии", risks: ["Регистрация и оплата не выполняются продуктом"],
    gaps: ["Нет личного плана баллов", "Число баллов не известно ни по одному событию снимка"], blockers: ["Портал НМО (edu.rosminzdrav.ru) — нет открытого API"],
    code: ["server/agents/snapshots/events.ts"], tests: ["tests/unit/agent-evidence.test.ts"],
    acceptance: "Баллы показываются только подтверждёнными; иначе — статус «не указано»", changed: null,
  },
  {
    id: "learning.level_based", scenario: "E3", title: "Обучение с учётом уровня",
    outcome: "Следующий шаг по специальности и цели (занятие, аккредитация, повторение) с объяснением и ссылкой; прогресс",
    entry: ["строка ввода: «хочу освежить …»", "«Для вас» — карточка обучения"], agent: "learning", executors: ["server/agents/executor-learning.ts", "server/agents/services/learning.ts"], tools: ["generateLearningPlan", "searchPubmed"],
    connectors: ["catalog", "esc-guidelines", "pubmed", "events-listings"], sources: ["КР и обзоры по специальности"], sourcePriority: "—", statusBefore: "PARTIAL", status: "PARTIAL", depth: "runtime_api",
    persistence: "profile.learningProgress", ui: "Карточка «Следующий шаг»", risks: ["Синтетический тест нельзя выдавать за официальный материал аккредитации"],
    gaps: ["Нет уровней (студент / ординатор / врач)", "Нет тестов и разбора ошибок"], blockers: ["Банк вопросов с источником или редакционная проверка синтетических тестов"],
    code: ["server/agents/executor-learning.ts"], tests: ["tests/unit/skill-learning-connectors.test.ts", "tests/e2e/portal-journey.spec.ts"],
    acceptance: "Шаг объяснён реальными сигналами, без выдуманной истории", changed: null,
  },
  {
    id: "community.share", scenario: "F1", title: "Поделиться материалом",
    outcome: "Ссылка на результат с названием, кратким описанием и источниками, без чужой библиотеки; проверка персональных данных; срок и отзыв",
    entry: ["кнопка «Поделиться» у ответа, находки, справки по препарату и карточки материала", "профиль → «Ссылки, которыми я поделился»"],
    agent: "platform", executors: ["server/agents/commands.ts (previewShare, createShare, revokeShare)"], tools: [], connectors: [],
    sources: ["Публичные источники самого результата (ссылки http/https)"],
    sourcePriority: "Делятся только результатами из публичных источников; свои файлы и партнёрские материалы не публикуются",
    statusBefore: "UNAVAILABLE", status: "PARTIAL", depth: "none",
    persistence: "share_links (PostgreSQL): снимок, срок 30 дней, отзыв, счётчик открытий", ui: "Панель «Поделиться» (предпросмотр → «Создать ссылку» → копировать / отправить / отозвать); публичная страница /s/[token] (noindex)",
    risks: ["Публикация приватного материала — заблокирована по владельцу результата", "Персональные данные пациента в тексте — проверка правил обезличивания и «конкретного пациента» до создания ссылки; правило консервативное: похожие на номер документа цифры тоже блокируют ссылку"],
    gaps: ["Делиться своими файлами и подборками нельзя: правила обезличивания недостаточны, чтобы публиковать документ врача", "Отправка коллеге внутри продукта невозможна — нет учётных записей", "Ссылка — снимок: не обновляется вслед за источником (так сказано на странице)"],
    blockers: ["Учётные записи врачей — для адресной отправки и подборок «для коллег»"],
    code: ["lib/sharing/snapshot.ts", "server/sharing/store.ts", "server/agents/commands.ts", "app/s/[token]/page.tsx", "components/portal/share-result.tsx", "db/migrations/0005_agent_schedules_and_share_links.sql"],
    tests: ["tests/unit/sharing.test.ts", "tests/integration/sharing.test.ts"],
    acceptance: "Публичная ссылка только явным действием, после проверки на ПДн; отзыв ссылки",
    changed: "Новые ссылки: предпросмотр того, что увидит получатель, повторная проверка на сервере, снимок без данных рабочего пространства, срок 30 дней, отзыв, список ссылок в профиле, счётчик открытий",
  },
  {
    id: "community.cases", scenario: "F2", title: "Интерактивные клинические случаи",
    outcome: "Случай → выбор → разбор → источники; источник или явная пометка синтетического случая",
    entry: ["—"], agent: "learning", executors: [], tools: [], connectors: [], sources: [], sourcePriority: "—", statusBefore: "UNAVAILABLE", status: "UNAVAILABLE", depth: "none",
    persistence: "—", ui: "—", risks: ["Реальные истории пациентов с идентифицирующими сведениями"], gaps: [],
    blockers: ["Нет редакционно проверенного банка случаев с источником", "Пользовательские случаи требуют модерации и правил обезличивания"],
    code: ["lib/clinical-case/anonymizer.ts"], tests: ["tests/unit/agent-routing-risk.test.ts"],
    acceptance: "Ни одного случая без источника или пометки «синтетический»", changed: null,
  },
  {
    id: "community.forum", scenario: "F3", title: "Профессиональное сообщество",
    outcome: "Закрытое сообщество подтверждённых врачей с модерацией, жалобами и правилами",
    entry: ["—"], agent: "platform", executors: [], tools: [], connectors: [], sources: [], sourcePriority: "—", statusBefore: "UNAVAILABLE", status: "UNAVAILABLE", depth: "none",
    persistence: "—", ui: "—", risks: ["Врачебная тайна", "Токсичность", "Скрытая реклама"], gaps: [],
    blockers: ["Подтверждение статуса врача", "Модерация, жалобы, блокировки, правила публикации", "Юридическая политика публикаций о работодателе"],
    code: ["context/42_RETENTION_FIRST_PORTAL.md"], tests: ["tests/e2e/portal-journey.spec.ts"],
    acceptance: "Не запускается без перечисленных условий", changed: null,
  },
  // Rows of the matrix that are not numbered scenarios.
  {
    id: "reference.answer", scenario: null, title: "Справочный ответ на клинический вопрос",
    outcome: "Выводы обзоров и рекомендаций цитатой с источником и годом; российские КР и инструкции, когда распознаны",
    entry: ["главная строка ввода (задача по умолчанию)"], agent: "reference", executors: ["server/mesh/executor.ts (reference_answer)"], tools: ["readSource", "factCheck"],
    connectors: ["pubmed", "medi", "openfda-labels", "catalog", "esc-guidelines"], sources: ["КР РФ", "Инструкция", "Обзоры PubMed"], sourcePriority: "Российские источники первыми среди равных; «Приоритет» врача — порядок, не фильтр", statusBefore: "LIVE", status: "LIVE", depth: "runtime_api",
    persistence: "agent_runs + граф доказательств; переиспользование только при эквивалентных входах (PR #28)", ui: "Результат «Коротко → доказательства → источники»", risks: ["Нет русскоязычного синтеза: ответ — цитаты"],
    gaps: [], blockers: [],
    code: ["server/mesh/executor.ts", "lib/mesh/compiler.ts", "lib/portal/router.ts"], tests: ["tests/unit/mesh-experience.test.ts", "tests/unit/mesh-evidence-reuse.test.ts", "tests/unit/routing-clinical-terms.test.ts", "tests/e2e/mesh-acceptance.spec.ts"],
    acceptance: "Каждый вывод — цитата со ссылкой; разные вопросы не получают доказательства друг друга", changed: "PR #28 интегрирован; исправлена маршрутизация «события», ИБС, ИМ/АКШ (N21-05)",
  },
  {
    id: "pharma.mail_digest", scenario: null, title: "Разбор писем и материалов фармкомпаний",
    outcome: "Сводка писем фармкомпаний с пометкой «материал фармкомпании», отделение рекламы от практических данных",
    entry: ["—"], agent: "whats_new", executors: [], tools: [], connectors: ["email (UNAVAILABLE)"], sources: [], sourcePriority: "Партнёрский материал всегда раскрыт", statusBefore: "UNAVAILABLE", status: "UNAVAILABLE", depth: "none",
    persistence: "—", ui: "—", risks: ["Доступ к личной почте врача", "Смешение рекламы и независимых данных"], gaps: [],
    blockers: ["Подключение почты (Яндекс Почта) — отдельное продуктовое и правовое решение", "Политика обработки писем с персональными данными"],
    code: ["server/agents/connectors.ts"], tests: ["tests/e2e/agent-workspace.spec.ts"],
    acceptance: "Без подключения почты не заявляется", changed: null,
  },
  {
    id: "events.registration_handoff", scenario: null, title: "Регистрация и оплата мероприятий",
    outcome: "Переход на страницу организатора после подтверждения; продукт не регистрирует и не оплачивает",
    entry: ["событие → «Перейти к регистрации»"], agent: "events", executors: ["server/agents/services/action-confirmation.ts"], tools: [], connectors: ["rko-account (UNAVAILABLE)"],
    sources: ["Страница организатора"], sourcePriority: "—", statusBefore: "PARTIAL", status: "PARTIAL", depth: "handoff",
    persistence: "action_requests (handed_off)", ui: "Диалог «Нужно ваше подтверждение»", risks: ["Открытие страницы ≠ регистрация: метрика различает"],
    gaps: ["Регистрация и оплата за врача — вне продукта по решению команды"], blockers: [],
    code: ["server/agents/services/action-confirmation.ts", "components/workspace/action-confirm-dialog.tsx"], tests: ["tests/unit/agent-supervisor.test.ts", "tests/e2e/agent-workspace.spec.ts"],
    acceptance: "Статус handed_off, а не completed", changed: null,
  },
  {
    id: "boundary.patient_specific", scenario: null, title: "Задачи по конкретному пациенту",
    outcome: "Запрос по конкретному пациенту переформулируется в общий профессиональный вопрос; данные маскируются; лечение не подбирается",
    entry: ["строка ввода"], agent: "platform", executors: ["server/agents/services/risk.ts"], tools: ["riskCheck"], connectors: [], sources: [], sourcePriority: "—", statusBefore: "LIVE", status: "LIVE", depth: "none",
    persistence: "Исходный текст не сохраняется", ui: "Уведомление о маскировке и границе", risks: ["Утечка персональных данных"], gaps: [],
    blockers: ["Граница продукта (AGENTS.md): нет данных пациентов, МИС, назначений"],
    code: ["server/agents/services/risk.ts", "lib/agents/risk-rules.ts", "lib/clinical-case/anonymizer.ts"], tests: ["tests/unit/agent-routing-risk.test.ts", "tests/e2e/portal-journey.spec.ts"],
    acceptance: "ФИО, документы и даты рождения маскируются до любых источников; назначение не формулируется", changed: null,
  },
  {
    id: "boundary.wellbeing", scenario: null, title: "Личное состояние врача («мне тяжело, одиноко»)",
    outcome: "Бережный ответ без поиска по медицинским базам; продукт не заменяет поддержку",
    entry: ["строка ввода"], agent: "platform", executors: [], tools: [], connectors: [], sources: [], sourcePriority: "—", statusBefore: "UNAVAILABLE", status: "UNAVAILABLE", depth: "none",
    persistence: "—", ui: "—", risks: ["Запрос уходит в PubMed как клинический вопрос"], gaps: [],
    blockers: ["Вне профессионального справочного продукта; нужен утверждённый текст и проверенные контакты поддержки"],
    code: ["lib/agents/risk-rules.ts"], tests: ["tests/unit/agent-routing-risk.test.ts"],
    acceptance: "Личное обращение не превращается в поиск литературы", changed: null,
  },
  {
    id: "career.out_of_scope", scenario: null, title: "Карьера: позиционирование и дополнительный заработок",
    outcome: "—", entry: ["—"], agent: "platform", executors: [], tools: [], connectors: [], sources: [], sourcePriority: "—", statusBefore: "UNAVAILABLE", status: "UNAVAILABLE", depth: "none",
    persistence: "—", ui: "—", risks: [], gaps: [], blockers: ["Вне продукта: профессиональные знания и источники (context/42_RETENTION_FIRST_PORTAL.md)"],
    code: ["context/42_RETENTION_FIRST_PORTAL.md"], tests: ["tests/unit/portal-routing.test.ts"], acceptance: "Не рекламируется", changed: null,
  },
  {
    id: "platform.evidence_contract", scenario: null, title: "Отличие от общего чат-бота: источник у каждого утверждения",
    outcome: "Статус проверки, дата и ссылка у каждого утверждения; неподтверждённое не показывается как факт",
    entry: ["любой результат"], agent: "platform", executors: ["server/agents/services/fact-check.ts", "lib/mesh/policies.ts"], tools: ["factCheck"], connectors: [], sources: [], sourcePriority: "—", statusBefore: "LIVE", status: "LIVE", depth: "none",
    persistence: "Граф доказательств в прогоне", ui: "Метки «Подтверждено / Требует сверки», «Источники»", risks: [], gaps: [], blockers: [],
    code: ["server/agents/services/fact-check.ts", "lib/mesh/policies.ts"], tests: ["tests/unit/agent-evidence.test.ts", "tests/unit/mesh-experience.test.ts"],
    acceptance: "Политики EV-01…EV-06 блокируют неподтверждённое", changed: null,
  },
];

const R = (row: number, theme: string, task: string, disposition: RowDisposition, capabilities: string[], note: string): SourceRow => ({ row, theme, task, disposition, capabilities, note });

/** Every row of the source matrix (sheet `23_10_2026`), in sheet order. */
export const SOURCE_ROWS: readonly SourceRow[] = [
  R(2, "Препараты", "Разбор писем и материалов фармкомпаний", "implemented", ["pharma.mail_digest"], "Отдельный сценарий; почта не подключена"),
  R(3, "Информация", "Подписка на периодические издания и обработка информации", "merged", ["info.journal_subscriptions"], "Дубль строки 37 (B5)"),
  R(4, "Информация", "Терминология диагноза", "merged", ["reference.nosology"], "Определение и термины — часть справки по нозологии (B11)"),
  R(5, "Контекст пользователя", "Актуальные инструменты по моей специальности", "merged", ["context.tools_catalog"], "Дубль строки 51 (D3)"),
  R(6, "Контекст пользователя", "Восполнить пробелы в моих знаниях", "merged", ["learning.level_based"], "Обучение (E3)"),
  R(7, "Контекст пользователя", "Не знает, что хочет, с чего начать", "merged", ["feed.specialty_stream"], "«Для вас» и подсказки под строкой ввода"),
  R(8, "События", "Регистрация и оплата", "implemented", ["events.registration_handoff"], "Только переход к организатору после подтверждения"),
  R(9, "Сообщество", "Разбор сложного обезличенного случая с коллегами", "merged", ["community.forum"], "Требует сообщества (F3)"),
  R(10, "Карьера", "Позиционирование себя на рынке", "out_of_scope", ["career.out_of_scope"], "Вне профессионального справочного продукта"),
  R(11, "Карьера", "Дополнительный заработок", "out_of_scope", ["career.out_of_scope"], "Вне продукта"),
  R(12, "Карьера", "Индивидуальный план развития", "merged", ["learning.level_based"], "Цели обучения (E3)"),
  R(13, "Карьера", "Знаю теорию, но не умею применять к случаю", "merged", ["community.cases"], "Клинические случаи (F2)"),
  R(14, "Пациенты", "Пост-сопровождение пациента", "boundary", ["boundary.patient_specific"], "Граница: нет данных пациентов"),
  R(15, "Пациенты", "Подготовка ко встрече с пациентом", "boundary", ["boundary.patient_specific", "reference.answer"], "Общий вопрос по теме — справочный ответ"),
  R(16, "Пациенты", "Неизвестный случай, не могу помочь", "boundary", ["boundary.patient_specific", "reference.answer"], "Только обезличенный общий вопрос"),
  R(17, "Пациенты", "Оценить текущее состояние", "boundary", ["boundary.patient_specific"], "Граница: оценка конкретного пациента не выполняется"),
  R(18, "Пациенты", "Критически оценить план лечения", "boundary", ["boundary.patient_specific", "evidence.cross_check"], "Только сверка источников по общему вопросу"),
  R(19, "Пациенты", "Актуальный статус", "boundary", ["boundary.patient_specific"], "Граница продукта"),
  R(20, "Пациенты", "Лечение и процедуры", "boundary", ["boundary.patient_specific", "reference.answer", "evidence.method_evidence_base"], "Общий профессиональный вопрос — справочный ответ"),
  R(21, "Пациенты", "Анализы и обследования, лечение и процедуры", "boundary", ["boundary.patient_specific", "reference.norms_calculators"], "Нормы и шкалы — B15; бланки пациента не загружаются"),
  R(22, "Я — человек", "Я боюсь, волнуюсь, мне одиноко, не к кому обратиться", "implemented", ["boundary.wellbeing"], "Бережная маршрутизация без поиска по базам"),
  R(23, "Я — человек", "Покажи, где я ошибаюсь в рассуждении", "merged", ["evidence.cross_check"], "Сверка источников (B7)"),
  R(24, "Я — человек", "Мне не хватает опыта, наставника", "merged", ["learning.level_based", "community.cases"], "Обучение и случаи"),
  R(25, "Я — врач", "Моя специальность Н, мне нужно Р", "merged", ["reference.nosology"], "Справка по нозологии вне специальности с границами"),
  R(26, "Без темы", "Общий клинический запрос", "implemented", ["reference.answer"], "Задача строки ввода по умолчанию"),
  R(27, "Без темы", "Просто что-нибудь почитать, посмотреть, узнать", "merged", ["feed.specialty_stream"], "«Для вас»"),
  R(28, "Новички", "«В DeepSeek лучше, ChatGPT быстрее, но всё равно перепроверять»", "implemented", ["platform.evidence_contract"], "Отличие продукта — проверяемые источники"),
  R(29, "Препараты", "Новые препараты в нозологии", "implemented", ["drugs.new_approvals"], "A1"),
  R(30, "Препараты", "Сравнить 2–3–4 лекарства", "implemented", ["drugs.compare"], "A2"),
  R(31, "Препараты", "Инструкция, доза, противопоказания по российскому источнику", "implemented", ["drugs.label_reference"], "A3"),
  R(32, "Препараты", "Регуляторные изменения по моим препаратам", "implemented", ["drugs.safety_watchlist"], "A4"),
  R(33, "Информация", "Составить реферат", "implemented", ["research.literature_review"], "B1"),
  R(34, "Информация", "Задать вопрос к части материала", "implemented", ["materials.fragment_question"], "B2"),
  R(35, "Информация", "Уточнить по своим загруженным материалам", "implemented", ["materials.answer_from_own"], "B3"),
  R(36, "Информация", "Поиск информации по загруженным ранее материалам", "implemented", ["materials.search_library"], "B4"),
  R(37, "Информация", "Подписка на периодические издания", "implemented", ["info.journal_subscriptions"], "B5"),
  R(38, "Информация", "Сформировать свою базу знаний", "implemented", ["materials.knowledge_base"], "B6"),
  R(39, "Информация", "Проверить по нескольким источникам", "implemented", ["evidence.cross_check"], "B7"),
  R(40, "Информация", "Актуальность и фактчекинг", "implemented", ["evidence.currentness_check"], "B8"),
  R(41, "Информация", "Разбор исследований", "implemented", ["research.study_appraisal"], "B9"),
  R(42, "Информация", "Что нового по медицине", "implemented", ["news.general_digest"], "B10"),
  R(43, "Информация", "Информация о заболеваниях", "implemented", ["reference.nosology"], "B11"),
  R(44, "Информация", "Что нового по теме специальности", "implemented", ["feed.specialty_stream"], "B12"),
  R(45, "Информация", "Доказательная база", "implemented", ["evidence.method_evidence_base"], "B13"),
  R(46, "Информация", "Общие рекомендации и профилактика", "implemented", ["reference.prevention"], "B14"),
  R(47, "Информация", "Параметры и нормы методов исследования, шкалы, калькуляторы", "implemented", ["reference.norms_calculators"], "B15"),
  R(48, "Документы", "Формы и шаблоны, нормативные документы", "implemented", ["documents.forms_regulations"], "C1"),
  R(49, "Контекст пользователя", "Новые исследования по моей теме", "implemented", ["context.topic_research_alerts"], "D1"),
  R(50, "Контекст пользователя", "Изменения клинических рекомендаций по моим темам", "implemented", ["context.guideline_changes"], "D2"),
  R(51, "Контекст пользователя", "Всё необходимое из инструментов в одном месте", "implemented", ["context.tools_catalog"], "D3"),
  R(52, "События", "Поиск событий", "implemented", ["events.search"], "E1"),
  R(53, "События", "События и обучение с баллами НМО", "implemented", ["events.nmo_plan"], "E2"),
  R(54, "Сообщество", "Поделиться материалом", "implemented", ["community.share"], "F1"),
  R(55, "Сообщество", "Кейсы", "implemented", ["community.cases"], "F2"),
  R(56, "Сообщество", "Общение, профессиональное сообщество", "implemented", ["community.forum"], "F3"),
  R(57, "Карьера", "Помоги учиться на моём текущем уровне", "implemented", ["learning.level_based"], "E3"),
];

/** Rows 2–57 of sheet `23_10_2026` (row 1 is the header). */
export const SOURCE_ROW_RANGE = { first: 2, last: 57 } as const;

/** Conflicts between the documents of the task, how the code was checked and the decision taken. */
export interface DocumentConflict {
  id: string;
  between: string;
  observed: string;
  decision: string;
}

export const DOCUMENT_CONFLICTS: readonly DocumentConflict[] = [
  {
    id: "CF-01", between: "Мастер-промпт §3/§11 («Главное · Мои агенты · Мои материалы · Настройки», 7 агентов) ↔ AGENTS.md и context/42 («Мои агенты» как основная навигация — наследие; одна строка + «Для вас»)",
    observed: "В коде навигация «Главное · Агенты · Мои материалы · Обезличивание» + профиль/настройки; «Агенты» — галерея возможностей, исполнение — через одну строку ввода (components/workspace/workspace-frame.tsx)",
    decision: "Сохранена текущая модель: одна строка ввода и «Для вас» на главной, «Агенты» — галерея и фоновые проверки. Семь агентов мастер-промпта — владельцы целей в коде (lib/agents/definitions.ts) и в этой матрице; новой навигации не добавлено",
  },
  {
    id: "CF-02", between: "Журнал работы (N21-05, сборки e21d67a/f85d764, порты :3141/:3128) ↔ GitHub",
    observed: "На GitHub e21d67a и правок N21-05 нет. В локальной копии владельца (Documents/kardio) найдена неопубликованная ветка fix/ux-recovery @ b46c23a: 47 коммитов поверх f85d764 (раунды 4–25, включая e21d67a, «Не учтено» — lib/portal/unmatched.ts и lib/portal/labels.ts, регрессионный набор tests/unit/ux-remediation.test.tsx); рабочие деревья чистые",
    decision: "fix/ux-recovery влита в рабочую ветку без переписывания истории (бандл, SHA сохранены). Маршрутизация и словарь взяты из неё как источник истины; моя реконструкция N21-05 (lib/agents/clinical-terms.ts) удалена. Поверх оставлены только совместимые дополнения: сравнение препаратов (A2), исключение источников (PR #27), ключ повторного использования (PR #28), общее правило «событий» для агентного роутера, «инфаркт мозга» → инсульт, метки версий «ver. 3.1». tests/unit/routing-clinical-terms.test.ts переписан на проверенную семантику раундов 21–25",
  },
  {
    id: "CF-03", between: "PR #19 (8 персон Product Council) ↔ решение владельца о трёх ревьюерах ↔ указание 24.10 «8 персон пользовательского Консилиума как отдельная функция»",
    observed: "PR #19 добавляет только .claude/agents (8 персон), .claude/commands/product-council.md и docs/PERSONA_PRODUCT_COUNCIL.md; код продукта не меняет; сам документ запрещает «add eight user-facing agents». В продукте прежний «Консилиум» (lib/ui/consilium.ts — 5 синтетических кардиологических персон; Expert Twins — модели реальных людей) выведен в архив; пункт галереи «Консилиум» убран в раунде 4 fix/ux-recovery",
    decision: "PR #19 влит как отдельный инструмент владельца (/product-council, 8 персон) — не заменяет внутреннюю команду из трёх ревьюеров и не становится навигацией врача. Будет ли «Консилиум» функцией для врачей и какие у него персоны — вопрос владельцу (задан 24.10); до ответа в продукт ничего не добавлено",
  },
  {
    id: "CF-04", between: "Мастер-промпт A3 (расчёт дозы по массе, СКФ) ↔ AGENTS.md / context/42 (нет назначений и дозирования пациенту)",
    observed: "Продукт показывает разделы инструкции; калькуляторы — справочные формулы",
    decision: "Дозу для пациента продукт не рассчитывает. Справочные формулы (СКФ, клиренс креатинина, ИМТ) — с единицами, источником и ограничениями, без подстановки в схему дозирования",
  },
  {
    id: "CF-05", between: "Мастер-промпт B1/B2/B6 (реферат, объяснение фрагмента, конспект темы) ↔ docs/INTENT_EVIDENCE_EXPERIENCE_ARCHITECTURE.md («No model in the loop»)",
    observed: "В коде нет вызовов языковой модели; ответы — цитаты источников",
    decision: "Генерация текста не добавлена без решения команды; сценарии отмечены PARTIAL/UNAVAILABLE с блокером «слой синтеза»",
  },
  {
    id: "CF-06", between: "План для трёх и более препаратов («Открою российские инструкции: A, B, C») ↔ фактическое исполнение",
    observed: "Вопрос уходил в разбор исследований, инструкции не открывались; адаптеры читали только первый препарат",
    decision: "Две независимые правки одной ошибки: fix/ux-recovery (N22-01) сделала план честным — одна инструкция, остальные по ссылке на ГРЛС; drug_comparison (A2) сделала исполнение полным. После слияния: для сравнения по инструкциям план называет все инструкции (их читают все), для остальных ответов — правило N22-01",
  },
];
