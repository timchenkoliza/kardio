# START HERE — KARDIO / Claude Sonnet 5.5 High Reasoning

## Product boundary

This product has **no access to patient data, EHR/EMR, appointment schedules, encounter context, diagnostic device data, or clinical tasks**.

Do not invent them in concepts, mocks, flows, or UI.

This is a professional physician product built around:
- trusted knowledge;
- source navigation;
- search;
- calculators/tools;
- guideline updates;
- professional sources;
- explicit user customization;
- later, carefully controlled recommendation / Gen-UI.

## Core positioning

> A cardiology work navigator: Russian clinical guidelines, practical scenarios, calculators, medicines, referral/VMP routes and important updates — without patient data, with a source behind every answer.

## Product strategy

Do not build medicine from scratch.

Own:
- UX;
- search;
- structuring;
- retrieval;
- tagging;
- distribution;
- usage analytics;
- source/capability orchestration.

Clinical authority must come from:
- official guidelines;
- professional societies;
- licensed/contracted sources;
- clinical editors;
- external experts.

## V3 conflict guard

This repository still contains artifacts from an older patient/EHR/workflow concept.

Before reading beyond the v3 path below, read:
- `16_V3_SOURCE_OF_TRUTH_AUDIT.md`

If any repository file conflicts with the no-patient-data boundary, the current v3 boundary wins unless the user explicitly overrides it.

Do not merge patient/EHR-era concepts into the current MVP.

## Read order

1. `16_V3_SOURCE_OF_TRUTH_AUDIT.md`
2. `product/PRODUCT_BOUNDARIES.md`
3. `product/MVP_ARCHITECTURE.md`
4. `knowledge/source_modes.json`
5. `knowledge/source_registry.cardiology.json`
6. `ranking/RANKING_POLICY_V3.md`
7. `product/GENUI_EVOLUTION.md`
8. `pilot/RKO_PILOT.md`
9. `metrics/MVP_METRICS.md`
10. `legal/LEGAL_GATES_RU.md`
11. `08_VISUAL_DISCOVERY_BRIEF_V3.md`
12. `13_PHASE_1_PROMPT_V3.md`

`knowledge/KNOWLEDGE_ARCHITECTURE.md` is currently mixed with stale patient-context concepts and is not authoritative for v3 until rewritten.

## First-screen source-of-truth

The initial MVP screen should be based on:
- large search;
- four quick jobs;
- recent items;
- frequent tools/queries;
- one compact updates row;
- source always one tap away.

Do not make AI chat the primary surface.
Do not require registration before first value.
Do not require a user profile before first value.
Do not introduce inferred personalization in MVP.

## Gen-UI status

Gen-UI is a **later hypothesis**, not the base MVP.

First prove:
- fast successful retrieval;
- trust;
- repeat usage.

Then allow explicit user-created workspaces from approved modules.

## Absolute non-goals

- patient data;
- EHR integration;
- AI diagnosis;
- therapy selection for a patient;
- autonomous clinical decisions;
- hospital information system;
- clinical alerting;
- patient prioritization;
- automatic doctor personality profiling;
- engagement-maximizing feed.
