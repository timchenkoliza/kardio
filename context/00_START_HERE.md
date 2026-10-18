# START HERE — KARDIO / v3 current product context

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

## Read order

1. `16_V3_SOURCE_OF_TRUTH_AUDIT.md`
2. `phase2/MULTI_SHELL_ARCHITECTURE.md`
3. `17_REAL_CONTENT_AUDIT.md`
4. `18_EDITORIAL_IMAGE_POLICY.md`
5. `product/PRODUCT_BOUNDARIES.md`
6. `product/MVP_ARCHITECTURE.md`
7. `knowledge/source_modes.json`
8. `knowledge/source_registry.cardiology.json`
9. `ranking/RANKING_POLICY_V3.md`
10. `product/GENUI_EVOLUTION.md`
11. `pilot/RKO_PILOT.md`
12. `metrics/MVP_METRICS.md`
13. `legal/LEGAL_GATES_RU.md`
14. `08_VISUAL_DISCOVERY_BRIEF_V3.md`
15. `13_PHASE_1_PROMPT_V3.md`

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

This prototype now uses the real Golden Set render path.

Runtime pieces:
- `data/goldenset-chunk-01.js` … `goldenset-chunk-05.js`
- `data/cardio_goldenset_loader.js`
- `data/cardio-evaluation-slice-v1.bundle.js`
- `data/content-image-enrichment.bundle.js`
- `phase2/content-runtime.js`
- `phase2/kardio-app.js`
- `phase2/kardio-real.css`

The active render path no longer uses the old hard-coded demo `catalog` / `sources` arrays.

Saved items, recent activity, pins and query state persist across shell switches.

`phase2/kardio-multishell.html` is an earlier selection-wrapper prototype and should not be treated as the current architecture proof.

## Pixel-first status

The user has selected the multi-shell direction and real-content binding is implemented.

The pixel-first build contract may now be applied to **all three shells**, with the requirement that shared content/business rules remain consistent.

Next gate:
- open the real-content prototype in a browser;
- inspect 390 / 768 / 1440;
- correct typography, geometry, wrapping, density, state hierarchy and A/B/C consistency;
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
