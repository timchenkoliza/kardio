# Phase 1 — Shared Content Set

Status: **visual-discovery fixture only**. This file does not define final clinical content, source endorsement, or production taxonomy.

All Phase 1 concepts must use this same content set so architecture can be compared without content bias.

## Product boundary

No patient data, EHR/EMR, appointments, encounter context, patient-specific results, patient-specific tasks, diagnosis, therapy selection, or clinical alerts.

## Primary user

Cardiologist using KARDIO as a professional knowledge and tool navigator.

## Core first-screen jobs

Use these working labels during visual discovery:

1. **Клинические рекомендации** — find and inspect a guideline answer with source visibility.
2. **Калькуляторы** — open a professional calculator/tool.
3. **Препараты** — verify drug/reference information through an approved source.
4. **Маршрутизация / ВМП** — navigate referral/VMP information.

These labels are provisional and must be validated with cardiologists before final product copy is frozen.

## Shared demo query

`ХСН: найти актуальную рекомендацию и первоисточник`

This is a navigation/retrieval example, not a patient-specific clinical question.

## Shared result set

Use the following source classes and demo items:

### Guideline result
- title: `Клинические рекомендации · Хроническая сердечная недостаточность`
- source class: `official / guideline`
- UI requirement: publication/update date when available; source one tap away; AI summary visibly separated from source fact.

### Professional-society result
- title: `Российское кардиологическое общество · ХСН`
- source class: `professional society`
- research status: observed in source research
- trust rule: appearance in research does not itself establish clinical endorsement.

### Journal/editorial result
- title: `Кардиология · материалы по ХСН`
- source class: `journal / editorial`
- research status: observed in source research
- trust rule: visually separate from official guideline content.

## Shared tools

### Calculator demo
- label: `Калькулятор`
- example shortcut: `eGFR`
- status: demo capability only; production implementation/source is UNKNOWN until clinical/legal approval.

### Drug/reference demo
- label: `Проверить препарат / МНН`
- status: entry-point mock only; production provider is UNKNOWN.

### Referral/VMP demo
- label: `Маршрутизация / ВМП`
- status: navigation mock only; source model and jurisdiction coverage are UNKNOWN.

## Shared Recent items

1. `ХСН · клинические рекомендации`
2. `eGFR · калькулятор`
3. `РКО · профессиональный источник`

## Shared Frequent / pinned items

1. `Клинические рекомендации`
2. `Калькуляторы`
3. `РКО`

Pinned/frequent state is explicit or deterministic in Phase 1. Do not imply inferred behavioral profiling.

## Shared update row

Use one compact professional-update item:

- source: `РКО`
- topic: `ХСН`
- label: `Профессиональное обновление · демо`
- reason shown: `Кардиология → ХСН → источник выбран пользователем / редакцией`

Do not invent a real medical claim or a fake publication date.

## Source Registry examples

Use observed research entries only as examples of source classes, not endorsements:

- `Российское кардиологическое общество` — professional society
- `Кардиология журнал` — professional publication
- `1Med.TV Первый медицинский канал` — professional materials
- `Doc Сфера (от фарм компаний)` — pharma/commercial; must be visibly separated
- user-added link/channel — user-owned/unverified until independently assessed

## Provenance pattern

Every medical-information result must expose:

- source name;
- source class;
- update/publication date when actually known;
- distinction between source fact and AI/editorial summary;
- path to original source.

## AI presence

In Phase 1 AI may appear as a secondary affordance for:

- query understanding;
- retrieval assistance;
- summary of approved source material;
- later workspace assembly.

AI chat must not be the home screen or dominant navigation model.

## Required Phase 1 scenes

Every concept must make these jobs legible:

1. Home / first value
2. Search results
3. Guideline answer with citation/provenance
4. Calculator entry
5. Drug/reference entry
6. Source registry
7. Professional update item
8. Save/recent
9. Add/pin source
10. Later Gen-UI/custom workspace as a secondary extension only

## Responsive anchors

Phase 1 comparison anchors:

- 390 × 844
- 768 × 1024
- 1440 × 1000

Current v3 role hypothesis:

### Desktop
Best for dense search results, source comparison, guideline reading, registry browsing, and multi-pane knowledge work.

### Tablet
Best for search, reading, calculators/tools, source inspection, and compact workspace navigation.

### Phone
Best for fast search, quick jobs, recent/pinned tools, compact source verification, and short reference tasks.

Phone is not a shrunk desktop workspace.

## Content-lock rule

Concepts may change hierarchy, navigation, density, and interaction architecture.
They may not change the shared content set to make one concept look stronger.
