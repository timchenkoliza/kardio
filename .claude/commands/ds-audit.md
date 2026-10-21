---
description: DS-аудит деплоя kardio по дизайн-системе Яндекс Мед и список правок
argument-hint: "[url] [--routes /a,/b] [--baseline report.json | --base-url url]"
---

Запусти сабагента `ds-auditor` с аргументами: $ARGUMENTS

Если URL не указан, проверяй прод `https://kardio-eta.vercel.app`. Аудит только детерминированный (`--no-ai`): Anthropic API не вызывается. После отчёта собери задачи на исправление по приоритетам P0 → P3; задачи в GitHub заводи только после подтверждения.
