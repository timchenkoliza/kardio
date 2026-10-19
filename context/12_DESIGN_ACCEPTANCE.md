# Design Acceptance Criteria — V3

Status: **authoritative for the current no-patient-data KARDIO / Yandex Med prototype**.

The previous patient/EHR-era acceptance criteria are obsolete and must not be used for the current product.

## Product boundary

The design must not introduce:

- patient cards;
- EHR/EMR context;
- appointments/encounters;
- patient-level prioritization;
- diagnosis/treatment recommendations for an individual patient;
- autonomous clinical actions.

Current product scope is professional physician knowledge, sources, search and tools.

## Shared-shell rule

A / B / C are three interface shells over one shared product/domain layer:

- A — Search-first Navigator;
- B — Professional Toolbelt;
- C — Knowledge Workspace.

All three must use the same canonical Golden Set objects and the same specialty visual system.

Do not make visual style another uncontrolled A/B/C variable.

## Real-content acceptance

The current evaluation state is acceptable only if:

- all three shells consume the same 24-object evaluation slice;
- source URLs are preserved;
- long real titles are not truncated in a way that changes meaning;
- current / review / superseded states remain visible;
- missing calculators / drugs / VMP data are not replaced with invented content;
- saves / recent / pins operate on canonical object identity;
- no obsolete demo catalog/source arrays remain in the active render path.

## Editorial-image acceptance

`18_EDITORIAL_IMAGE_POLICY.md` is authoritative.

The UI must support image-free cards as a first-class state.

A content image may render only when its semantic mapping and provenance/rights state allow it.

Do not use:

- generic doctor photography as fallback;
- Pinterest/moodboard screenshots as content;
- one repeated clinical image across unrelated materials;
- visually attractive but semantically incorrect medical imagery.

## Specialty visual identity acceptance

Read:

- `19_SPECIALTY_VISUAL_IDENTITY.md`
- `20_SPECIALTY_VISUAL_TOKENS.json`

Core rule:

> **Yandex Med owns the interface. Specialty owns the atmosphere.**

The Cardiology prototype uses:

- concept: `PULSE / PERFUSION`;
- visual physics: `FLOW`;
- calibrated palette v0.2;
- Yandex Med lavender reference `#8A8BFF` unless an official internal token is available.

### Color acceptance

The screen must remain neutral-dominant:

- approximately 65–70% white/neutral canvas;
- approximately 15–20% low-chroma soft surfaces;
- around 10% Yandex Med lavender family;
- 4–7% strong Cardiology garnet/wine accent;
- other high-chroma accents kept rare.

Reject a screen if:

- purple, red and blue have equal visual weight;
- the entire interface is tinted by specialty color;
- Cardiology red replaces semantic error/negative colors;
- sage/green becomes an arbitrary decorative accent;
- the palette reads as beauty/wellness rather than professional cardiology.

### Form acceptance

Geometry should feel like one coherent Yandex Med family:

- small controls approximately 10–12 px radius;
- search / major controls approximately 16–20 px radius;
- cards / panels approximately 18–20 px radius;
- major overlays approximately 24–28 px radius;
- pills reserved for badges/status/chips;
- do not mix sharp rectangles, pills and highly rounded cards without semantic reason.

Shadows must remain restrained. Borders and spacing should establish hierarchy before elevation effects.

### Specialty atmosphere

Cardiology may appear through:

- subtle flow-like gradients;
- steel/cath-lab blue bridge tones;
- garnet/wine editorial accents;
- soft blush/oxygen surfaces;
- real cardiology imagery when semantically correct.

Avoid literal decorative hearts, ECG zig-zags and generic hospital-blue styling.

## Typography acceptance

- use YS Text when available, otherwise the defined fallback stack;
- maintain a limited type scale;
- titles may wrap naturally for real content;
- avoid arbitrary font-size changes between shells;
- metadata must remain readable without competing with titles;
- no font zoo.

## Interaction-state acceptance

- focus-visible state exists for keyboard interaction;
- hover/pressed states do not change semantic meaning;
- selected shell/navigation state is explicit;
- status badges remain semantically distinct from brand/specialty accents;
- source links remain visibly actionable.

## Responsive acceptance

Inspect at minimum:

- **390 px** mobile;
- **768 px** tablet;
- **1440 px** desktop.

At each anchor viewport verify:

- no horizontal overflow;
- long titles remain readable;
- filters remain usable;
- image-free cards remain intentional;
- real image crop preserves medically relevant content;
- navigation does not obscure core actions;
- A / B / C remain recognizably the same product family.

Do not claim responsive or visual QA as complete unless those viewports were actually rendered and inspected.

## Pixel-first completion criteria

Pixel-first is complete only after real-content binding and specialty visual identity are stable.

Required final checks:

- typography rhythm;
- spacing rhythm;
- card density;
- border/radius consistency;
- source/status badge hierarchy;
- image crops;
- empty/image-free states;
- mobile/tablet/desktop behavior;
- no random legacy green/grey theme remnants;
- no old demo visual language remaining in active screens.

## Acceptance outcome

A successful screen should read, in this order:

1. **Yandex Med product**;
2. **professional cardiology environment**;
3. **specific A/B/C interaction model**.

If the shell identity, specialty color or content imagery becomes stronger than the Yandex Med product identity, the balance is wrong.