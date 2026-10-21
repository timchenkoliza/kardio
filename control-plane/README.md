# Kardio Product Engineering Control Plane

Цель: превратить продуктовую гипотезу в управляемый автоматический цикл

`problem → Change → experience contract → branch → implementation → simulations/evals → preview → canary → rollout/rollback → learning`,

где Product управляет intent, job, risk budget и критериями успеха, а не отдельными инженерными задачами.

## Главное: Change — это не ticket

`Change` — центральный продуктово-инженерный объект. Он связывает пять слоёв:

1. **Product Intent** — проблема, сегмент, JTBD, гипотеза, target metric.
2. **Experience Contract** — какой job должен остаться/появиться, какой module family допустим, как представлять информацию, что можно персонализировать, нужен ли contextual onboarding и что обязано остаться стабильным.
3. **Implementation Envelope** — ожидаемые пути, branch, candidate SHA, out-of-scope.
4. **Evidence Contract** — обязательные evals, simulations, CI, DS, domain evidence.
5. **Release Contract** — rollout ceiling, promotion criteria, kill/rollback criteria.

Поэтому PR не может считаться понятным только потому, что код компилируется. Для user-facing изменения система должна знать, **какое изменение пользовательского опыта автор намеревался сделать**.

## Две независимые оси blast radius

### R0–R4: engineering/domain risk

- **R0** — docs/copy;
- **R1** — UI/layout;
- **R2** — agent/routing/ranking/content behavior;
- **R3** — DB/API/auth/state/actions/release infrastructure;
- **R4** — medical evidence/safety/clinical-risk semantics.

### E0–E4: experience/mental-model impact

- **E0** — пользовательская семантика не меняется;
- **E1** — presentation-only;
- **E2** — task fit / result ranking / module selection / representation;
- **E3** — meaningful capability / personalization / onboarding / structural blueprint;
- **E4** — mental model / core navigation / action semantics / factual meaning.

Release gates = **union(R gates, E gates)**.

Rollout ceiling = **min(R ceiling, E ceiling)**.

Так UI-изменение может быть технически R1, но experience-wise E4 — и выпускаться как E4, а не как «простая верстка».

## Adaptive Experience Compiler внутри Change

Control Plane не рендерит интерфейс сам. User-facing runtime в будущем компилирует ограниченный `ExperienceManifest`:

`Request → Job → Module → Knowledge → Representation → ExperienceManifest → Renderer`.

LLM может **предложить** job/module/representation, но production renderer принимает только валидный manifest из зарегистрированных capabilities/components.

Никакой arbitrary frontend generation на каждый запрос.

### Stable Shell + Adaptive Interior

Персонализация может менять:

- ordering;
- density;
- default expansion;
- visual/text ratio;
- prominence;
- shortcuts;
- suggested actions;
- onboarding depth.

Она не может молча менять:

- factual meaning;
- safety thresholds;
- compliance semantics;
- destructive action semantics;
- recognizable core navigation landmarks.

Structural personalization требует confidence/expiry/invalidation contract и выпускается как E3+.

## Contextual onboarding

Onboarding — не атрибут каждого релиза. Он обязателен только для **meaningful capability transition**, релевантного текущей job пользователя.

Состояния guide:

`unseen → shown → engaged → completed/dismissed → mastered`.

`dismissed` не должен nag-ить; `mastered` физически подавляет повторные guides.

## Runtime / release capabilities

1. **Product Orchestrator** — переводит гипотезу в Change; реализацию не пишет.
2. **Risk Classifier** — R-axis.
3. **Experience Impact Classifier** — E-axis.
4. **Eval Designer** — связывает JTBD/failure modes с golden cases.
5. **Branch Engineer** — работает только в feature branch/worktree.
6. **Static Verification** — deterministic checks.
7. **Simulation Director** — persona, dependency failure, adversarial, state, experience and release simulations.
8. **Evidence Judge** — exact-SHA evidence only.
9. **Preview Manager** — связывает candidate SHA и Vercel preview/DS audit.
10. **Release Controller** — deterministic rollout ceiling/promotion.
11. **Telemetry Analyst** — product target + guardrails.
12. **Rollback Controller** — last-known-good and rollback recommendation.
13. **Learning Archivist** — incident/eval miss → regression case.

Это capabilities, не 13 отдельных LLM. Один runtime может исполнять несколько capabilities; права разделяются policy.

## Что детерминировано

LLM не принимает финальное решение по:

- typecheck/build/test status;
- migration/schema compatibility;
- candidate/base SHA identity;
- required evidence completeness;
- rollout percentage;
- error/latency thresholds;
- blocking DS/security findings;
- stable-shell invariants;
- Experience Contract validity;
- release transition.

LLM нужен для planning, eval generation, semantic diff diagnosis и explanation.

## Existing Kardio primitives

Переиспользуем:

- `.github/workflows/ci.yml` — Postgres, migrate/seed idempotency, typecheck, lint, unit/integration, npm audit, build, Playwright;
- `.github/workflows/ds-audit.yml` — deployment-based design regression;
- `tests/live/*` — controlled live-source smoke;
- `server/agents/*` — runtime/executors/tools;
- telemetry — activation, TTFV, retention/repeat-use;
- `tools/ds-audit/*` — exact deployment auditing.

## Первый исполняемый vertical slice

В этой ветке уже есть:

- `control-plane/lib/model.ts` — Change/ExperienceManifest/DecisionTrace contracts;
- `control-plane/lib/risk.ts` — R + E classification;
- `control-plane/lib/experience.ts` — Experience Contract validation;
- `control-plane/lib/decision.ts` — deterministic release state machine;
- `control-plane/runner.ts` — shadow executor;
- `control-plane/policies/kardio-v1.yaml` — policy-as-data;
- `control-plane/simulations/kardio-v1.yaml` — simulation matrix;
- `.github/workflows/control-plane-shadow.yml` — every PR receives an advisory shadow decision;
- unit tests for classifier, contract and release decisions.

Output per run:

- `change_contract.json`;
- `candidate_sha.txt`;
- `baseline_sha.txt`;
- `risk_assessment.json`;
- `gate_results.json`;
- `release_decision.json`;
- `human_readable_summary.md`.

Future experience simulations additionally persist `experience_manifest_samples.json` and `decision_traces.json`.

## Shadow-mode rule

Current system may classify, simulate, inspect and recommend.

It **cannot**:

- merge `main`;
- execute rollout;
- weaken a required gate;
- accept evidence from another SHA;
- turn a failed gate into PASS by model opinion.

A release decision of `BLOCK` is advisory during shadow mode. A broken control-plane self-test is not advisory — that workflow fails.

## Product Control Room

Product should see one Change card, not a list of agents:

- Problem / JTBD
- Hypothesis
- R risk + E impact
- Current stage
- Baseline vs candidate
- Experience delta
- Failed simulations
- Missing evidence
- Eligible rollout
- Kill criteria
- Last-known-good SHA
- Required human decision

Product-level commands:

`Build candidate` · `Run simulations` · `Show why blocked` · `Open preview` · `Approve canary` · `Hold` · `Rollback`.

## Definition of done for v1

v1 считается работающим, когда на реальном Kardio Change система автоматически:

1. получает/создаёт Change Contract;
2. классифицирует R и E;
3. связывает diff с exact candidate SHA;
4. проверяет Experience Contract для user-facing изменений;
5. требует evals до merge;
6. собирает CI + simulation + DS/domain evidence;
7. генерирует machine-readable release decision;
8. не может рекомендовать rollout при missing/failed required gate;
9. рекомендует допустимый cohort percentage;
10. backfill-ит production miss как regression scenario.

## Shadow exit criteria

Только после минимум 5 завершённых Change:

- false-green decisions = 0;
- false-block rate ≤ 20%;
- каждый incident превращён в regression case;
- exact-SHA evidence integrity подтверждена;
- human decisions и shadow decisions сравнены.

После этого можно отдельно обсуждать право системы автоматически менять rollout cohorts. Право merge в `main` — отдельный этап зрелости, не часть v1.
