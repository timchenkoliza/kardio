---
description: Запустить восемь персон-агентов против текущего Kardio и довести лучший вывод до одного проверяемого Product Change
argument-hint: "[focus: home|intent|result|retention|partner|copy|visual|all]"
---

Прочитай `AGENTS.md` и `docs/PERSONA_PRODUCT_COUNCIL.md`.

Цель: улучшить актуальный Kardio, а не написать восемь эссе. Базовый scope — текущая ветка/точный SHA; если передан `$ARGUMENTS`, сузь аудит до этого фокуса, но не нарушай общие продуктовые ограничения.

Запусти независимыми сабагентами все восемь персон:

- `executive-hr`
- `wow-manager`
- `bigtech-operator`
- `domain-revenue-architect`
- `human-agency-reviewer`
- `cognitive-effectiveness-reviewer`
- `spectacle-director`
- `russian-sensemaker`

Каждому передай один и тот же brief:

> Проанализируй текущий Kardio на exact SHA. Найди максимум пять конкретных улучшений в своей зоне ответственности. На каждое: факт/файл/поверхность → пользовательское или бизнес-следствие → изменение → evidence → что нельзя ухудшить. Не выдумывай данные. Не предлагай patient/EHR/MIS сценарии. Не экспонируй внутренние agents/Skills/sources как навигацию. Цель продукта: один профессиональный intent врача → честное evidence-backed решение → естественное продолжение → причина вернуться.

Сначала получи все независимые ответы; не показывай агентам ответы друг друга до завершения первого прохода.

Затем сам выступи оркестратором, а не девятым мнением:

1. Разложи предложения по root cause и убери дубли.
2. Зафиксируй противоречия между персонами.
3. Разреши их по precedence из `docs/PERSONA_PRODUCT_COUNCIL.md`.
4. Составь shortlist максимум из 7 Product Changes.
5. Для каждого укажи Problem/Job, Experience Delta, metric, guardrails, owner roles, R*/E*, negative obligations, acceptance, verification, rollback.
6. Выбери ровно ОДИН highest-leverage Change.
7. Если он требует нового медицинского факта, medical/domain approval или ослабления gate — создай только Change/evidence plan и остановись до кода.
8. Иначе реализуй минимальный coherent slice, добавь проверки и прогоняй релевантные gates. Не заявляй о непрогнанных проверках.
9. Сравни с pre-change exact SHA и перечисли NEW / FIXED / DEGRADED.
10. Запиши итог в `docs/reviews/persona-council-YYYY-MM-DD.md`.

Важно: Human Agency может BLOCK. Cognitive Effectiveness не имеет права вырезать клинически важную неопределённость. Russian Sensemaker не имеет права менять медицинский смысл. Spectacle Director не имеет права усиливать клиническое утверждение. Revenue Architect не имеет права ухудшать physician trust ради партнёрской экономики.

Финальный результат команды — не backlog, а один проверяемый Change и следующий bottleneck.