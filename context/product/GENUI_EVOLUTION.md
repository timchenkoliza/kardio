# Gen-UI Evolution — not MVP core

## Why keep the idea

The "iPhone" metaphor is useful:
- useful system defaults;
- a library of approved capabilities;
- user-created screens;
- user-added links and Telegram channels;
- optional AI-assisted assembly.

But this should appear **after** baseline utility is proven.

## Stage 0 — no personalization

First screen:
- search;
- quick jobs;
- recent;
- frequent;
- updates.

No inferred profile.

## Stage 1 — explicit customization

Allow:
- pin source;
- pin calculator;
- save topic;
- reorder shortcuts;
- add link;
- add Telegram channel;
- create named collection.

No algorithmic inference required.

## Stage 2 — user-created screens

Examples:
- "ХСН"
- "Липиды"
- "Мои КР"
- "Обучение"
- "Мои каналы"

Screens contain approved module types:
- search;
- guideline collection;
- calculator group;
- source updates;
- saved content;
- links/channels;
- events;
- learning.

## Stage 3 — Gen-UI assistant

User can say:

> Собери мне экран по ХСН: РКО, новые КР, два калькулятора и мой канал.

The model outputs a validated WorkspaceSpec.

The renderer—not the LLM—owns component implementation.

## Important

Gen-UI may personalize **professional information access**.

It must not:
- claim patient awareness;
- create patient-specific recommendations;
- invent clinical context;
- silently redesign permanent user screens;
- use opaque engagement objectives.
