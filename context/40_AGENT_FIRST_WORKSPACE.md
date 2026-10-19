# 40 — Agent-first physician workspace (product direction)

Status: current product direction. Date: 2026-10-19. Supersedes the feed / three-shell home and the A/B/C shell model as the primary surface. All boundaries in `00_START_HERE.md` and `AGENTS.md` stay in force (no patient data, no EHR, no autonomous clinical action, Golden Set immutability, provenance, oncology isolation).

## Shift

FROM a content portal where the product team selects and publishes information for cardiologists
TO a workspace where physicians configure goals, interests, sources and professional jobs, and agents continuously execute those jobs with shared tools and trusted sources.

## Hierarchy (non-negotiable)

USER sees JOBS → AGENTS own GOALS → TOOLS own CAPABILITIES → CONNECTORS own ACCESS TO EXTERNAL SYSTEMS.

Sources, fact checking, risk checking, PubMed, Telegram, РКО, the source library are never products or navigation sections.

## Information architecture

Primary: **Главное** (command center) · **Мои агенты** · **Мои материалы**. Secondary: **Настройки** (темы, источники и подключения, партнёрские материалы, приватность, демонстрация).

Removed from primary navigation: Лента, Консилиум, image interpretation, Справочник, ВМП, Калькуляторы, Источники, РКО/Telegram as sections, visualizations. The previous interface is frozen as an archive at `/[specialty]/legacy` (not linked except from Settings); Consilium, imaging and the clinical-case shell render a "выведен из продукта" notice there.

## Agents (user-facing)

Что нового для меня · Изменения рекомендаций · Препараты · Исследовать тему · События · Моё обучение · Мои материалы. Each agent has an explicit `AgentDefinition` (`lib/agents/definitions.ts`).

## Mandatory gates

- Fact check on every medical evidence item: `SUPPORTED / PARTIALLY_SUPPORTED / UNSUPPORTED / UNKNOWN`; unsupported organic findings are not shown as sourced facts.
- Risk check on input (de-identification, prescribing reframing, emergency and image-interpretation blocks) and output (directive wording).
- Action confirmation for anything outside the product (calendar, email, registration, purchase, publishing): prepared ≠ executed.

## Honesty about integrations

Every connector declares `LIVE`, `MOCK` or `UNAVAILABLE` plus its data origin (`runtime_api`, `catalog_snapshot`, `curated_snapshot`, `user_content`, `synthetic_fixture`). Curated snapshots are real public records with URL and retrieval date; they are refreshed by the editorial pipeline, never presented as live feeds.

## Composer is not a chat

The «Что хотите делегировать?» composer routes a task to one agent and opens that agent's result page with plan, evidence and next actions. There is no open-ended chat surface.
