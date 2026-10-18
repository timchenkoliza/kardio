# Yandex Med Specialty Visual Identity System

Status: **authoritative specialty visual-language rule**.

Version: **v0.2**  
Date: **2026-10-18**

## Purpose

This document defines how specialties receive a distinct visual identity inside Yandex Med without becoming separate products, microsites or independent brands.

Core rule:

> **Yandex Med owns the interface. Specialty owns the atmosphere.**

Operationally this means approximately **80% Yandex Med / 20% specialty identity**.

The specialty layer may influence color, imagery, data-viz, editorial surfaces, abstract motifs and subtle motion. It must not rewrite product architecture, information hierarchy, medical facts, ranking logic, source/provenance rules or semantic UI status colors.

## Priority of truth

When requirements conflict, use this order:

1. **Content truth** — canonical Golden Set / shared product data.
2. **Image truth** — `18_EDITORIAL_IMAGE_POLICY.md`.
3. **Specialty visual identity** — this document.
4. **Pixel execution** — layout, spacing, responsive tuning, micro-polish.

Visual attractiveness never overrides semantic accuracy or provenance.

## Yandex Med core identity — stable across specialties

Preserve:

- YS Text typography where available;
- predominantly white / very-light surfaces;
- graphite / near-black primary typography;
- Yandex Med lavender/periwinkle as the cross-specialty anchor;
- rounded geometry;
- restrained spacing and generous white space;
- clean AI-native visual language;
- shared navigation and component behavior;
- shared interaction patterns;
- shared semantic colors for success, warning, negative/error and status.

Do not create a second design system per specialty.

## Yandex Med lavender anchor

Current visual reference sampled from the supplied live Yandex Med landing-page screenshot:

- **Yandex Med Lavender / Periwinkle reference:** `#8A8BFF`

This is a **reference value observed from the current product surface**, not a claim that this HEX is the canonical internal design-system token.

Implementation rule:

- if an official Yandex Med design token is available in the product code/design system, inherit that token;
- do not create a near-duplicate lavender token merely because this file contains a sampled HEX;
- until the official token is available, use `#8A8BFF` as the visual reference for prototype calibration.

The previous provisional `#8D86FF` value is deprecated for this project.

---

# 1. Color-system rules

The palette must behave like a designed color system, not a row of equally loud swatches.

## 1.1 Hue relationships

Use color harmony deliberately:

- **Yandex Med lavender** is the persistent cool brand anchor.
- **Cardiology** introduces a deep garnet/wine family as the warm specialty counterpoint.
- A desaturated **cath-lab / steel blue** acts as the cool bridge between the Yandex lavender and the warm cardio family.
- **Oncology** stays closer to the lavender family through aubergine/mauve, with muted mineral sage as a tertiary counterweight.

For Cardiology the intended relationship is a restrained near-triadic tension:

`lavender/periwinkle → cool steel blue bridge → garnet/wine specialty accent`

For Oncology the intended relationship is predominantly analogous:

`lavender/periwinkle → aubergine → mauve`

with low-chroma sage used sparingly.

## 1.2 Chroma rules

Do not give every palette color equal saturation.

- Base canvas and neutral surfaces: **very low chroma**.
- Soft specialty surfaces: **low chroma**.
- Secondary bridge colors: **low-to-medium chroma**.
- Yandex Med lavender: **higher chroma, limited area**.
- Specialty primary/deep accent: **medium-to-high chroma, limited area**.
- Never place multiple high-chroma specialty colors at equal visual weight in the same module.

If a screen starts to look like a themed dashboard, reduce specialty chroma and increase neutral area.

## 1.3 Proportion rules

Recommended visual balance for specialty screens:

- **65–70%** neutral / white / canvas;
- **15–20%** soft mist / low-chroma specialty surfaces;
- around **10%** Yandex Med lavender family;
- **4–7%** strong specialty primary/deep accent;
- **≤3%** other strong accents.

These are art-direction proportions, not literal CSS area calculations.

The purpose is to prevent a 25/25/25/25 split between purple, red, blue and white.

## 1.4 Semantic-color protection

Specialty colors must not replace semantic status colors.

In particular:

- Cardiology red/berry/wine must not become the universal negative/error color;
- specialty green/sage must not become the universal success color;
- Yandex lavender must not be used as normal body text on white merely because it is a brand color.

Preserve the existing product semantics for:

- error / danger;
- warning;
- success / positive status;
- disabled state;
- focus / selected states where already defined by the base system.

## 1.5 Accessibility floor

Color is not allowed to reduce legibility.

Prototype guidance:

- normal text should target WCAG AA contrast (4.5:1 or better);
- large text should target at least 3:1;
- `#8A8BFF` on white is an accent/background color, not a normal-text color;
- `#B65B70` is borderline for normal white-background text and should not be used as the default text color;
- deep wine/plum colors are suitable for high-contrast text on white but should remain editorial accents rather than replacing the base ink everywhere.

---

# 2. Cardiology — PULSE / PERFUSION

## 2.1 Concept

Cardiology should evoke:

- blood flow;
- perfusion;
- pressure;
- rhythm;
- echocardiography;
- hemodynamics;
- vascular movement;
- cath-lab precision;
- cardiovascular imaging;
- procedural technology.

The identity should feel clinical, precise, contemporary and calm.

It must not become decorative “heart branding”.

## 2.2 Calibrated Cardiology palette — v0.2

| Token role | Name | HEX | Intended role |
|---|---|---:|---|
| Cross-specialty anchor | Yandex Med Lavender | `#8A8BFF` | Brand continuity, limited emphasis |
| Specialty primary | Cardio Garnet | `#741E31` | Deep editorial/cardio accent |
| Specialty secondary | Berry | `#B65B70` | Mid accent, graphic transition |
| Soft warm surface | Tissue Blush | `#F3E5E8` | Large low-chroma background surface |
| Cool bridge | Cath-lab Blue | `#86A9B9` | Diagnostic/technical bridge to lavender |
| Soft cool surface | Oxygen Mist | `#E7EFF3` | Large low-chroma background surface |
| Deep editorial | Deep Wine | `#491923` | High-contrast editorial emphasis |
| Primary ink | Ink | `#262633` | Main text / neutral foreground |
| Base canvas | Canvas | `#FAFAFF` | Main background |

The previous Cardiology v0.1 palette centered on `#A9445A` + `#D98B9B` is deprecated. It skewed too strongly toward pink/beauty/wellness when used together.

The v0.2 system deliberately deepens the warm accent toward **garnet / wine** and increases the role of **steel / cath-lab blue**, matching the desired Pinterest moodboard character more closely while remaining compatible with Yandex Med lavender.

## 2.3 Cardiology visual physics

### FLOW

The defining behavior is continuous directed movement.

Preferred motifs:

- soft directional gradients;
- elongated vessel/lumen-like abstract forms;
- pressure-wave rhythm;
- controlled pulse;
- layered echo-like structures;
- fluid transitions;
- restrained directional motion;
- thin or soft-flowing data paths.

The motif should remain abstract unless the content itself contains a real medical diagram.

## 2.4 Cardiology photography

Prefer real, source-grounded imagery such as:

- echocardiography;
- coronary angiography;
- cath-lab environments;
- hemodynamic monitoring;
- cardiac CT / MRI / cine;
- cardiovascular devices;
- procedural hands;
- authentic cardiologist portraits;
- authentic congress/event photography;
- real source figures from journals and professional societies.

Preferred tonal world:

> **garnet / berry / skin / steel / monitor blue / white / subtle lavender**

Photography should feel observational and professional rather than promotional.

### Cardiology anti-patterns

Do not use as the main visual language:

- bright generic red;
- giant anatomical hearts;
- decorative ECG zig-zags;
- Valentine's-heart symbolism;
- blood splashes;
- generic doctor-with-stethoscope photography;
- generic operating-room stock;
- blue hospital-stock aesthetics;
- one cardiology image repeated across unrelated cards.

If no semantically correct image exists, use an image-free card.

---

# 3. Oncology — CELL / PRECISION

## 3.1 Concept

Oncology should communicate:

- cell biology;
- pathology;
- microscopy;
- molecular diagnostics;
- imaging;
- precision oncology;
- targeting;
- local concentration;
- structural change;
- multidisciplinary expertise.

The identity should feel analytical, intelligent and precise.

It must not use fear, illness severity or mortality as its visual differentiator.

## 3.2 Calibrated Oncology palette — v0.2

| Token role | Name | HEX | Intended role |
|---|---|---:|---|
| Cross-specialty anchor | Yandex Med Lavender | `#8A8BFF` | Brand continuity, limited emphasis |
| Specialty primary | Aubergine | `#5B4966` | Specialty primary / editorial accent |
| Specialty secondary | Cellular Mauve | `#9985A6` | Mid accent / image atmosphere |
| Soft primary surface | Cell Mist | `#F1EDF3` | Large low-chroma background surface |
| Tertiary counterweight | Mineral Sage | `#A8BAB2` | Sparse tertiary accent only |
| Soft secondary surface | Mineral Mist | `#E8EFEC` | Low-chroma supporting surface |
| Deep editorial | Deep Plum | `#403646` | High-contrast editorial emphasis |
| Primary ink | Ink | `#262633` | Main text / neutral foreground |
| Base canvas | Canvas | `#FAFAFF` | Main background |

Mineral Sage is tertiary. It must not become a co-primary color; overuse risks a wellness/spa aesthetic.

## 3.3 Oncology visual physics

### CLUSTER / TARGET

The defining behavior is local structure and directed focus.

Preferred motifs:

- soft clusters;
- cellular grouping;
- translucent overlapping forms;
- local density;
- target/focus states;
- structured networks;
- controlled expansion/contraction;
- isolated highlighted regions.

Motion, when used, should feel analytical rather than biological or threatening.

## 3.4 Oncology photography

Prefer:

- histology;
- pathology;
- microscopy;
- PET / CT;
- molecular diagnostics;
- laboratory workflows when directly relevant;
- multidisciplinary tumor boards;
- authentic oncologist portraits;
- original scientific figures;
- real publication imagery.

Preferred tonal world:

> **off-white / lilac shadow / graphite / translucent violet / muted mineral green**

### Oncology anti-patterns

Avoid:

- cancer ribbons as the primary brand device;
- dark fatalistic imagery;
- distressed-patient stock photography;
- decorative tumor illustrations;
- fear-driven visual cues;
- black-heavy “serious disease” aesthetics;
- generic scientific imagery chosen only because it looks molecular.

---

# 4. Editorial-image-policy relationship

`18_EDITORIAL_IMAGE_POLICY.md` always has priority over this document.

Image resolution order remains:

1. exact visual from the same content object/source;
2. source figure / publication cover / expert portrait / event photo;
3. semantically exact uploaded clinical asset with tracked provenance/rights;
4. original publisher / society / university asset;
5. image-free card.

Generic doctor photography is **not** a fallback.

Pinterest screenshots and moodboards are:

`reference_only_do_not_render_as_content`

They may influence:

- palette;
- composition;
- visual rhythm;
- material feel;
- lighting;
- art direction.

They must never be rendered as production medical content.

Synthetic medical illustrations must not be presented as real clinical photography.

---

# 5. Implementation architecture

Specialty identity must be implemented through a reusable token layer rather than scattered hard-coded colors.

Recommended base interface:

```css
--med-brand-lavender
--med-specialty-primary
--med-specialty-primary-soft
--med-specialty-secondary
--med-specialty-secondary-soft
--med-specialty-deep
--med-specialty-accent
--med-specialty-gradient
--med-specialty-image-tint
```

Suggested specialty switch:

```html
data-specialty="cardiology"
data-specialty="oncology"
```

or an equivalent token mechanism.

Do not rewrite the entire base design system per specialty.

## Where specialty identity may appear

Use selectively in:

- hero atmosphere;
- editorial section surfaces;
- card cover zones;
- specialty labels/cues;
- data visualization;
- section dividers;
- subtle selected states where semantics remain clear;
- abstract motifs;
- image treatments;
- light gradient fields;
- limited decorative motion.

Do not apply indiscriminately to:

- every button;
- all navigation;
- all text;
- every border;
- every card;
- semantic status colors.

The user should perceive **Yandex Med first, specialty second**.

---

# 6. A / B / C consistency

The three Phase 2 shells must share:

- one Yandex Med base identity;
- one Cardiology specialty token system;
- one editorial image policy;
- one typography system;
- one semantic status system;
- one core component grammar.

A / B / C may differ in product hierarchy, navigation, density, composition and interaction model.

They must not look like unrelated brands.

Specialty identity is a shared layer across all three shells, not another A/B/C variable.

---

# 7. Execution order

Do **not** apply this visual system to placeholder/demo content.

Required order:

1. canonical Golden Set binding;
2. shared 24-object evaluation slice across A/B/C;
3. image resolver / provenance rules;
4. specialty visual identity integration;
5. pixel-first polish;
6. final responsive/visual QA.

The visual-identity pass begins only after the real-content render path is stable.

---

# 8. Acceptance criteria

The system passes when:

- the screen remains immediately recognizable as Yandex Med;
- Cardiology is perceptible without relying only on a text label;
- Oncology is visually distinct from Cardiology but still belongs to the same product family;
- color proportions remain neutral-dominant rather than theme-dominant;
- strong specialty colors are accents rather than full-screen paint;
- semantic status colors remain unambiguous;
- the identity works for image-free cards;
- the identity works with real source imagery;
- no Pinterest/moodboard image is rendered as content;
- A / B / C remain directly comparable as product concepts;
- future specialties can be added through the same token grammar;
- final pixel-first polish can refine execution without redefining the identity.

## Current approved directions

- **Cardiology:** `PULSE / PERFUSION`, palette v0.2.
- **Oncology:** `CELL / PRECISION`, palette v0.2.

These are the current approved starting directions for the specialty visual-identity layer.