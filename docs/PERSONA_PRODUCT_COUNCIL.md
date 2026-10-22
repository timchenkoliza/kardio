# Persona Product Council — Kardio

Status: active working protocol on `feature/persona-product-council`, stacked on Draft PR #17 (`feature/intent-skills-flows`). This layer does not change the physician-facing information architecture by itself.

## Purpose

Use the eight personas defined in the product thread as an internal adversarial product council that continuously improves Kardio without exposing agents as product navigation.

The council reviews the same product from different objective functions, resolves conflicts explicitly, converts the result into Control Plane `Change` proposals, and only then allows implementation when the required evidence gates are satisfiable.

## Personas

| Agent | Question it must answer |
| --- | --- |
| `executive-hr` | Is this a mature, defensible management decision with real ownership, consequences and learning? |
| `wow-manager` | Are we solving the real problem, and what decision should be made now? |
| `bigtech-operator` | Who owns this, what metric moves, what are the decision rights and execution contract? |
| `domain-revenue-architect` | Is there a real economic unlock and defensible buyer/partner value, or only capabilities? |
| `human-agency-reviewer` | Does the experience preserve physician agency, truthfulness, privacy and meaningful choice? |
| `cognitive-effectiveness-reviewer` | Does the result minimize thought/decision cost while preserving necessary evidence? |
| `spectacle-director` | Can the correct idea become distinctive and memorable without distortion? |
| `russian-sensemaker` | Does the product speak precise, natural Russian that specialists can act on directly? |

Existing `ds-auditor` remains a deterministic design-system audit tool and is not one of these personas.

## Non-negotiable product boundary

Read and obey `AGENTS.md` before every council run.

Especially:
- professional knowledge/evidence/navigation for physicians, not patient-specific decision support;
- no patient data, EHR/EMR/MIS, active encounter state, patient-specific labs/imaging/prescriptions/tasks;
- one professional intent in → the system chooses execution → one coherent result → contextual continuation;
- agents, Skills, tools and connectors stay internal;
- no source picker or agent catalogue;
- evidence provenance, currentness, conflicts and gaps remain honest;
- partner/pharma content must remain distinguishable from independent evidence;
- external actions require confirmation;
- product changes go through the Control Plane and exact-SHA evidence.

## Common mission

Improve Kardio as a professional physician product by increasing the probability that a physician:

1. states a real professional job once;
2. gets a trustworthy, current, evidence-backed result fast;
3. understands what matters without reconstructing the system mentally;
4. can continue/refine the same result naturally;
5. remembers why the product is useful and has a credible reason to return;
6. can distinguish independent evidence, uncertainty and partner content;
7. experiences calm, precise Russian and a distinctive but non-distorting visual/product language.

Commercial improvements are valid only when they preserve physician trust and product boundaries.

## First review scope

Inspect the latest stacked product, not `main` in isolation. Review at minimum:

- first visit / home / specialty-aware entry;
- the one-input physician intent surface;
- clarification and explicit-plan states;
- cardiology guideline-change and drug-evidence Skills;
- pediatric drug-reference Skill;
- generic fallback for specialties without curated Skills;
- evidence/currentness/conflict/provenance presentation;
- result-as-context and refinement UX;
- saves/return/retention surfaces;
- feed and professional discovery surfaces still present in the stack;
- partner/pharma surfaces and disclosure;
- Russian product copy;
- visual hierarchy, distinctiveness and memory;
- failure/partial-source states.

## Phase 1 — independent reviews

Run all eight personas against the same exact branch/SHA and same stated product goal.

Do not let one persona read another persona's review before producing its own findings.

Each persona returns no more than five findings. Every finding must contain:

- observed fact / file / surface;
- user or business consequence;
- proposed change;
- evidence needed to believe it;
- what must not regress.

No generic advice.

## Phase 2 — conflict resolution

Do not average opinions. Resolve them by explicit precedence:

1. repository/product boundary and factual/medical evidence;
2. `human-agency-reviewer` BLOCKs;
3. clinical provenance/currentness and release gates already encoded in the Control Plane;
4. real physician outcome and `cognitive-effectiveness-reviewer`;
5. executable ownership/metrics from `bigtech-operator`;
6. real-problem/decision quality from `wow-manager`;
7. commercial value from `domain-revenue-architect`;
8. language from `russian-sensemaker`;
9. spectacle from `spectacle-director`.

`executive-hr` challenges whether the final decision is mature and defensible; it does not override medical evidence or ethics.

Spectacle may compress or dramatize presentation, never facts. Language may simplify syntax, never clinical meaning. Commercial value never overrides physician trust.

## Phase 3 — shortlist

Synthesize at most seven candidate improvements. Rank them by:

`expected physician outcome × evidence confidence × strategic value / implementation cost / risk`.

For each candidate write:

- Problem / Job;
- observed evidence;
- proposed Experience Delta;
- primary metric;
- guardrails;
- Business/Product/Engineering owner roles;
- R* engineering/domain risk;
- E* experience/mental-model risk;
- negative obligations;
- acceptance criteria;
- exact verification method;
- rollback condition.

Reject duplicates that solve the same root cause.

## Phase 4 — choose one Change

Choose only one highest-leverage candidate for implementation per council run.

It may proceed to code only when all are true:

- Human Agency: PASS or REVISE fully addressed;
- no new unsupported clinical claim is required;
- product boundary remains intact;
- owner, metric, guardrails and negative obligations are explicit;
- the result can be verified in tests/simulations/Preview;
- it does not weaken an existing release gate.

If the best candidate requires medical/domain approval, new clinical evidence or an irreversible policy choice: write the Control Plane Change and required review evidence, then STOP before implementation.

## Phase 5 — implementation

For an implementable Change:

1. create/update the appropriate Control Plane Change artifact;
2. make the smallest coherent implementation;
3. add/adjust tests for the Experience Delta and negative obligations;
4. run the relevant typecheck/lint/unit/integration/e2e/simulation/DS gates available to the branch;
5. compare against the pre-change exact SHA;
6. report NEW / FIXED / DEGRADED behavior;
7. never claim success for a gate that was not run.

One council run should not become a broad redesign.

## Council output

Create/update `docs/reviews/persona-council-YYYY-MM-DD.md` with:

1. exact SHA reviewed;
2. eight independent verdict summaries;
3. disagreements and how they were resolved;
4. ranked shortlist;
5. chosen Change;
6. implementation status or explicit STOP reason;
7. verification evidence;
8. next unresolved bottleneck.

## Anti-patterns

The council must not:

- add eight user-facing agents;
- expose internal agent/Skill/source choices to physicians;
- turn every critique into a feature;
- solve copy before proving the product job;
- use retention as a reason for addictive engagement;
- use spectacle to exaggerate medicine;
- use Russian wording to weaken precision;
- use commercial goals to obscure sponsorship;
- bypass human/medical/domain release gates;
- produce a backlog so large that no decision is made.

The unit of success is not eight reports. It is one evidence-backed product Change with a clear owner, measurable physician outcome, preserved agency and a verified Experience Delta.