# KARDIO V3 — Source-of-Truth Audit

Status: **current product guardrail for v3-no-patient-data**.

This document exists to prevent stale patient/EHR-era artifacts from being merged back into the current product concept.

## 1. Current product truth

KARDIO is a professional cardiology knowledge and tool navigator for physicians.

Core jobs:
- find a guideline answer quickly;
- open and inspect the supporting source;
- use calculators/tools;
- verify drug/reference information;
- navigate referral/VMP information;
- understand important professional updates;
- save/revisit useful material;
- follow explicitly selected professional sources.

The product owns UX, search, navigation, structuring, retrieval, tagging, distribution, analytics and source/capability orchestration.

Clinical authority must come from approved external sources, professional societies, licensed/contracted knowledge, clinical editors and expert review.

## 2. Absolute boundary

The current product has **no access to**:
- patient data;
- EHR/EMR;
- appointment schedules;
- encounter context;
- active patient/case state;
- diagnostic-device data linked to a real patient;
- patient-specific results;
- patient-specific clinical tasks;
- patient-specific alerts or prioritization.

Therefore current concepts, mocks, schemas and UI must not contain or imply those capabilities.

## 3. MVP surface

The MVP should start from:
1. dominant search;
2. four quick jobs: guidelines, calculators, drugs/reference, referral/VMP;
3. recent searches/tools/references;
4. frequent or explicitly pinned tools/sources;
5. one compact professional-updates row;
6. a searchable source registry.

No required registration before first value.
No AI chat as the primary surface.
No inferred personalization profile in MVP.
No infinite engagement feed.

## 4. AI role

Allowed early roles:
- tagging;
- query understanding;
- retrieval assistance;
- draft summarization;
- editorial operations.

Medical publication remains under clinical editorial governance.

Later Gen-UI may assemble approved professional-information modules into explicit user-created workspaces.
It must not claim patient awareness or invent clinical context.

## 5. Ranking truth

MVP ranking should be deterministic and explainable.

Priority signals:
1. explicit query intent;
2. specialty/topic match;
3. source type;
4. freshness;
5. editorial priority;
6. explicit pin/follow;
7. verified trust/editorial status.

Do not optimize for time spent, session length or scroll depth.
Optimize for successful answer, source verification, useful repeat use, low correction rate and trust.

## 6. Source registry interpretation

Observed-in-research does **not** mean clinically endorsed.
`completeness` is metadata completeness only; it is not trust, evidence quality or editorial approval.

Official/guideline, research/evidence, editorial, expert/community, pharma/commercial and user-added sources must remain visibly distinct.

## 7. Visual discovery truth

Phase 1 must compare at least three structurally different architectures using the same jobs/content:
- Search-first Navigator;
- Professional Toolbelt;
- Knowledge Workspace.

Gen-UI/custom workspace is a later extension, not the base MVP.

Required scenes should be professional-information scenes such as home, search result, guideline answer with citation, calculator, drug/reference, source registry, update item, save/recent and add/pin source.

Do not design a clinical dashboard.
Do not use patient cards.
Do not make AI chat the home screen.
Do not build an engagement feed.

## 8. Stale/conflicting artifacts

The following files contain material from an older patient/EHR/workflow concept and must **not** be treated as current product truth without explicit rewrite:

- `context/01_SOURCE_OF_TRUTH.md`
  - active patient/queue item;
  - patient facts and longitudinal changes;
  - case-specific answers;
  - pre-visit brief, ambient note, AI-ECG triage, task closure.

- `context/02_PRODUCT_NORTH_STAR.md`
  - reconstruct patient context;
  - before/during/after visit JTBD;
  - documentation and critical-result workflows.

- `context/05_INFORMATION_ARCHITECTURE.md`
  - patient workspace;
  - visit mode;
  - result review;
  - therapy safety;
  - patient timeline/tasks/alerts.

- `context/06_TRUST_SAFETY_ACTIONS.md`
  - reading EHR/schedule/device data;
  - clinical notes/referrals/orders/prescriptions;
  - write-back and patient-specific audit concepts.

- `context/08_VISUAL_DISCOVERY_BRIEF.md`
  - morning queue;
  - pre-visit patient brief;
  - in-visit workspace;
  - post-visit task closure.

- `context/11_MOCK_SCENARIOS.json`
  - named synthetic patients;
  - labs, symptoms, diagnoses;
  - ambient recording;
  - patient-linked tasks.

- `context/12_DESIGN_ACCEPTANCE.md`
  - `/patient`, `/visit`, `/closure` routes;
  - active-patient requirements;
  - patient selection and draft clinical actions.

- `context/14_PHASE_2_BUILD_PROMPT.md`
  - acceptance requirements preserving active-patient identity, clinical unknowns and draft/executed patient actions.

- `context/knowledge/KNOWLEDGE_ARCHITECTURE.md`
  - active patient/case and workflow moment context;
  - patient-specific item fields;
  - patient brief/delta/result-review/therapy-safety/ambient-note modules.

- `context/personas/PHYSICIAN_PERSONA_MODEL.md`
  - active case, task and urgency in current context;
  - behavioral/inferred profile fields that exceed MVP needs.

- `context/genui/MODULE_REGISTRY.md`
  - patient queue/brief/delta/result review/therapy safety/ambient note/task-list as default modules.

- `context/genui/GENUI_WORKSPACE_MODEL.md`
  - default Patient/Follow-up screens and example patient-result workflow.

- `context/ranking/RANKING_POLICY.md`
  - active-patient/workflow candidate pool;
  - patient-specific clinical surfaces and critical-result prioritization.

- `README.md`, `docs/*`, `schemas/workspace-spec.schema.json`, `prototype/kardio_genui_workspace_lab.html`
  - these largely represent the earlier Gen-UI patient/workflow lab and are not the current v3 MVP.

## 9. Current authoritative files

Use these as current primary evidence unless a newer explicit user instruction overrides them:

1. `context/00_START_HERE.md`
2. `context/product/PRODUCT_BOUNDARIES.md`
3. `context/product/MVP_ARCHITECTURE.md`
4. `context/knowledge/source_modes.json`
5. `context/knowledge/source_registry.cardiology.json` as observed research, not endorsement
6. `context/ranking/RANKING_POLICY_V3.md`
7. `context/product/GENUI_EVOLUTION.md`
8. `context/pilot/RKO_PILOT.md`
9. `context/metrics/MVP_METRICS.md`
10. `context/legal/LEGAL_GATES_RU.md`
11. `context/08_VISUAL_DISCOVERY_BRIEF_V3.md`
12. `context/13_PHASE_1_PROMPT_V3.md`
13. this audit document

## 10. Product questions still UNKNOWN

These remain unresolved and should not be invented during visual discovery:
- exact labels for the four quick jobs;
- exact set of 10 initial cardiology topics/nosologies;
- which calculator implementations/sources are legally and clinically approved;
- which drug/reference source is approved for pilot use;
- exact VMP/referral source model and jurisdiction coverage;
- which source-registry entries pass trust/editorial review;
- exact content rights for indexing, summarization, translation and offline use;
- whether account creation is needed after first value and at what point;
- which saves/recent data are local-only vs server-side in the first release;
- exact visual identity/brand system;
- which one of the three Phase 1 architectures wins.

## 11. Cleanup recommendation

Do not delete the stale artifacts immediately: they preserve research/design history.

Instead:
1. mark stale files as deprecated for v3;
2. keep them out of the current read order;
3. create clean v3 replacements only where the stale file is still needed operationally;
4. replace the current patient-centric prototype only after Phase 1 selects a new architecture;
5. update root README and schemas when the new v3 direction becomes implementation-ready.

Until that cleanup is complete, this document plus `00_START_HERE.md` and the current-v3 files above win over conflicting older material.
