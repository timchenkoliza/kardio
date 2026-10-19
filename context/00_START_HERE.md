# START HERE — KARDIO / v3 current product context

> **Product direction update (2026-10-19):** the primary surface is now the agent-first physician workspace — read `40_AGENT_FIRST_WORKSPACE.md` first. The shell / feed sections below describe the previous interface, which is frozen as an archive at `/[specialty]/legacy`. All product boundaries in this file remain in force.

## Product boundary

This product has no access to patient data, EHR/EMR, appointment schedules, encounter context, diagnostic-device data linked to a patient, or patient-specific clinical tasks.

KARDIO is a professional cardiology knowledge and tool navigator for physicians.

Clinical authority must come from approved external sources, professional societies, licensed/contracted knowledge, clinical editors and expert review.

## V3 conflict guard

This repository still contains artifacts from an older patient/EHR/workflow concept.

Before reading beyond the v3 path below, read:
- `16_V3_SOURCE_OF_TRUTH_AUDIT.md`

If any repository file conflicts with the no-patient-data boundary, the current v3 boundary wins unless the user explicitly overrides it.

Do not merge patient/EHR-era concepts into the current MVP.

## Current interface architecture decision

The user explicitly selected **all three Phase 1 interface architectures** as first-class product shells:

1. Search-first Navigator;
2. Professional Toolbelt;
3. Knowledge Workspace.

Read:
- `phase2/MULTI_SHELL_ARCHITECTURE.md`

These are not three independent products and not cosmetic themes.
They are three user-selectable UI shells over one shared product/domain layer.

Shared across shells:
- search/query state;
- result objects;
- source/provenance rules;
- calculators/tools;
- drug/reference entry points;
- referral/VMP navigation;
- source registry;
- saves;
- recent history;
- pins/follows;
- trust/editorial status;
- legal/safety gates.

Shell choice is explicit, user-owned and reversible.
Do not infer it from behavior and do not silently switch it.

## Real-content phase

The product has moved from demo placeholders to the supplied source-grounded Cardio Golden Set.

Read:
- `17_REAL_CONTENT_AUDIT.md`
- `18_EDITORIAL_IMAGE_POLICY.md`

All three shells consume the **same canonical Golden Set objects**. They may differ only in ranking, grouping, navigation, density, composition and interaction model.

Do not fork facts per shell.
Do not invent missing medical metadata.
Do not hide currentness/version/rights uncertainty to make a card look cleaner.

### Editorial image correction

`Real image` does not mean `generic medical photo`.

Images require a semantically correct editorial match.
Priority is:
1. exact source asset;
2. supplied source-document asset;
3. semantically matched real uploaded asset with provenance/rights tracking;
4. credible external original-source asset;
5. no image.

An image-free card is better than irrelevant stock photography.
Do not treat Pinterest/moodboard screenshots as source content assets.
Do not reuse one generic doctor photo across unrelated cards.

## Specialty visual identity phase

Read:
- `19_SPECIALTY_VISUAL_IDENTITY.md`
- `20_SPECIALTY_VISUAL_TOKENS.json`
- `21_WORKBENCH_COMPONENT_REUSE.md`
- `12_DESIGN_ACCEPTANCE.md`

This is a shared visual layer across A / B / C, not another shell.

Core rule:

> **Yandex Med owns the interface. Specialty owns the atmosphere.**

Approved starting directions:
- Cardiology — `PULSE / PERFUSION`, visual physics `FLOW`, calibrated palette v0.2;
- Oncology — `CELL / PRECISION`, visual physics `CLUSTER / TARGET`, calibrated palette v0.2.

For current prototype calibration use Yandex Med lavender/periwinkle reference `#8A8BFF`. If an official Yandex Med design token becomes available, inherit the official token instead of creating a near-duplicate.

Specialty color must not replace semantic success / warning / error roles.
Pinterest/moodboard references are art-direction inputs only and remain `reference_only_do_not_render_as_content`.

## Workbench component reuse — mandatory

Do not invent a new geometry/component system for this prototype.

Reuse the previous Med Research Workbench / `med-feed-prototype-4` design contract and component grammar. The current static prototype ports that contract through:
- `phase2/workbench-contract.css`;
- `phase2/kardio-pixel.css`;
- `phase2/specialty-theme.js`.

The entry sequence is now:
1. choose specialty;
2. choose A/B/C working shell;
3. enter the real-content product.

Cardiology is active because a source-grounded Cardiology Golden Set exists.
Oncology may be visually previewed on the dividing screen but must **not** enter A/B/C using cardiology content until an oncology canonical dataset exists.

Required visual execution order:
1. canonical Golden Set binding;
2. shared 24-object evaluation slice;
3. image resolver / provenance rules;
4. specialty visual identity integration;
5. Workbench component reuse + pixel-first polish;
6. final responsive / visual QA.

The current repository has completed steps 1–4 and has started step 5.
Do not change canonical content to make visual layout easier.

## Read order

1. `16_V3_SOURCE_OF_TRUTH_AUDIT.md`
2. `phase2/MULTI_SHELL_ARCHITECTURE.md`
3. `17_REAL_CONTENT_AUDIT.md`
4. `18_EDITORIAL_IMAGE_POLICY.md`
5. `19_SPECIALTY_VISUAL_IDENTITY.md`
6. `20_SPECIALTY_VISUAL_TOKENS.json`
7. `21_WORKBENCH_COMPONENT_REUSE.md`
8. `12_DESIGN_ACCEPTANCE.md`
9. `product/PRODUCT_BOUNDARIES.md`
10. `product/MVP_ARCHITECTURE.md`
11. `knowledge/source_modes.json`
12. `knowledge/source_registry.cardiology.json`
13. `ranking/RANKING_POLICY_V3.md`
14. `product/GENUI_EVOLUTION.md`
15. `pilot/RKO_PILOT.md`
16. `metrics/MVP_METRICS.md`
17. `legal/LEGAL_GATES_RU.md`
18. `08_VISUAL_DISCOVERY_BRIEF_V3.md`
19. `13_PHASE_1_PROMPT_V3.md`

`knowledge/KNOWLEDGE_ARCHITECTURE.md` is currently mixed with stale patient-context concepts and is not authoritative for v3 until rewritten.

## Shared MVP capability truth

Every shell must expose the same core MVP capabilities:
- dominant search entry point;
- four quick jobs: guidelines, calculators, drugs/reference, referral/VMP;
- recent items;
- frequent / explicitly pinned tools and sources;
- compact important updates;
- searchable source registry;
- source/provenance always one transition away.

The shells may organize these capabilities differently, but must not fork their content, business rules or trust model.

Do not make AI chat the primary surface.
Do not require registration before first value.
Do not require a user profile before first value.
Do not introduce inferred personalization in MVP.

## Current prototype entry point

Use:
- `phase2/kardio-app.html`

This prototype uses the real Golden Set render path.

Runtime pieces:
- `data/goldenset-chunk-01.js` … `goldenset-chunk-05.js`
- `data/cardio_goldenset_loader.js`
- `data/cardio-evaluation-slice-v1.bundle.js`
- `data/content-image-enrichment.bundle.js`
- `phase2/content-runtime.js`
- `phase2/kardio-app.js`
- `phase2/kardio-real.css`
- `phase2/workbench-contract.css`
- `phase2/kardio-pixel.css`
- `phase2/specialty-theme.js`

The active render path no longer uses the old hard-coded demo `catalog` / `sources` arrays.

Saved items, recent activity, pins and query state persist across shell switches.

`phase2/kardio-multishell.html` is an earlier selection-wrapper prototype and should not be treated as the current architecture proof.

## Pixel-first status

Real-content binding and specialty identity are stable enough for pixel-first execution.

The current build now reuses the earlier Workbench visual contract instead of continuing the previous landing-page-like / random-geometry direction.

Current pixel-first requirements:
- YS Text / YS Display scale capped by the Workbench contract;
- 4-based spacing;
- control/card/sheet/pill radii only;
- light Workbench rails instead of a separate dark Toolbelt brand;
- specialty-first dividing screen;
- Cardiology color enters through a controlled token layer, not arbitrary per-component accents;
- A/B/C remain one visual family.

Next gate:
- open the real-content prototype in a browser;
- inspect 390 / 768(or 834) / 1440;
- correct wrapping, density, state hierarchy and A/B/C consistency;
- inspect the specialty selector before inspecting the shells;
- do not change canonical content to make layout easier.

Do not claim visual verification unless the shell was actually rendered and inspected at the required anchor viewports.

## Gen-UI status

Gen-UI remains a **later hypothesis**, not the base MVP.

First prove:
- fast successful retrieval;
- trusted source verification;
- repeat utility;
- predictable tool access;
- value of saved/pinned professional knowledge.

Then allow explicit user-created workspaces from approved modules.

The existence of the Knowledge Workspace shell does not automatically activate generative UI composition.

## Absolute non-goals

- patient data;
- EHR/EMR integration;
- appointment or encounter awareness;
- patient cards;
- patient-specific alerts/tasks;
- ambient clinical scribe;
- autonomous diagnosis/treatment;
- generic engagement feed;
- hidden inferred personalization;
- generic medical stock imagery used as filler.
