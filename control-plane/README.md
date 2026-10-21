# Kardio Product Engineering Control Plane

Цель: превратить изменение продукта в управляемый автоматический цикл `hypothesis → branch → simulations → evals → preview → canary → rollout/rollback`, где Product управляет intent, risk budget и критериями успеха, а не отдельными инженерными задачами.

## Принцип

Control Plane не является ещё одним пользовательским AI-агентом. Это надсистема над репозиторием, CI/CD, Vercel, evals и production telemetry.

На первом этапе она работает в `shadow`-режиме: может создавать план, классифицировать риск, запускать проверки и рекомендовать переход стадии, но не имеет права merge в `main` или самостоятельно расширять rollout.

## Объект управления: Change

Каждое изменение получает один immutable `change_id` и проходит состояния:

`IDEA → CONTRACTED → BRANCHED → IMPLEMENTED → STATIC_GREEN → SIMULATED → PREVIEW_GREEN → CANARY_ELIGIBLE → CANARY → ROLLOUT → STABLE`

Альтернативные состояния:

`BLOCKED`, `HOLD`, `ROLLED_BACK`, `REJECTED`.

Каждый переход требует evidence. Решения не принимаются только по текстовому мнению LLM.

## Контур агентов

1. **Product Orchestrator** — переводит продуктовую гипотезу в Change Contract, не пишет реализацию.
2. **Risk Classifier** — определяет blast radius и обязательные gates по путям/типу изменения.
3. **Eval Designer** — создаёт acceptance/eval cases до реализации и связывает их с JTBD и failure modes.
4. **Branch Engineer** — создаёт изолированную ветку/worktree, вносит изменение, не имеет права merge.
5. **Static Verification Agent** — typecheck/lint/unit/integration/build/security/data validation.
6. **Simulation Director** — запускает persona, dependency-failure, adversarial и regression simulations.
7. **Evidence Judge** — сравнивает candidate с baseline и выдаёт `PASS/HOLD/BLOCK`, сохраняя причины и артефакты.
8. **Preview Manager** — связывает commit SHA с Vercel Preview и существующим DS auditor.
9. **Release Controller** — рассчитывает допустимый rollout step по policy; в shadow-mode только рекомендует.
10. **Telemetry Analyst** — проверяет guardrails и target metrics для каждой cohort.
11. **Rollback Controller** — при breach формирует rollback decision и ссылку на last-known-good SHA.
12. **Learning Archivist** — превращает production incidents/eval misses в новые regression cases.

Это функциональные capability, а не 12 отдельных LLM-процессов. Один runtime может исполнять несколько capability, но права разделяются политикой.

## Что остаётся детерминированным

Нельзя отдавать LLM финальное решение по:

- migration safety;
- typecheck/build/test status;
- schema compatibility;
- URL/deployment identity;
- rollout percentage;
- error-rate/latency threshold;
- evidence completeness;
- presence of blocking DS/security findings.

LLM используется для planning, генерации evals, анализа diff и объяснения. Gate рассчитывается кодом/политикой.

## Existing Kardio primitives

Control Plane должен переиспользовать, а не дублировать:

- `.github/workflows/ci.yml` — Postgres, migrate/seed idempotency, typecheck, lint, unit/integration, npm audit, build, Playwright e2e;
- `.github/workflows/ds-audit.yml` — deployment-based design-system regression audit;
- `tests/live/*` — live-source smoke (ручной/контролируемый, потому что CI egress не гарантирован);
- `server/agents/*` — agent runtime/executors/tools;
- portal telemetry — activation, TTFV, retention/repeat-use signals.

## Product interface

Product не видит список агентов. Product видит одну Change карточку:

- Hypothesis / user problem
- Expected outcome
- Risk class
- Current stage
- Baseline vs candidate
- Failed simulations
- Required human decision (если есть)
- Eligible rollout: `0 / 1 / 5 / 20 / 50 / 100%`
- Kill criteria
- Last-known-good SHA

Команды уровня Product:

- `Build candidate`
- `Run simulations`
- `Show why blocked`
- `Open preview`
- `Approve 1% canary`
- `Hold`
- `Rollback`

## Definition of done for Control Plane v1

v1 считается работающим, когда для одного реального изменения Kardio система автоматически:

1. создаёт Change Contract;
2. определяет risk class;
3. создаёт branch;
4. требует evals до merge;
5. собирает CI + simulation + DS evidence;
6. связывает evidence с commit SHA;
7. выдаёт machine-readable release decision;
8. не может merge/deploy при `BLOCK`;
9. в shadow-mode рекомендует canary percentage;
10. сохраняет miss/incident как новый regression scenario.
