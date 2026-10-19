# Yandex Med Specialty Visual Identity System

Status: **authoritative specialty visual-language rule**  
Version: **v0.3**  
Date: **2026-10-18**

## 0. Authority and correction

The earlier sampled lavender `#8A8BFF` is no longer the brand anchor for this prototype.

The higher-authority `physician-world-research/System/Brand` material defines:

- primary typeface: **YS Text**;
- headline / main line: **YS Text Medium**;
- body / supporting copy: **YS Text Regular**;
- White calm: `#FFFFFF`;
- Digital blue: `#898BFF`;
- AI gradient: `#898BFF → #CEB6FF` on the dedicated gradient-construction page;
- palette-page alternate endpoint: `#DABDFF` — keep this as a documented WIP conflict, do not silently merge it;
- Lemon tech: `#FFFD89`, restrained interaction/change accent;
- Black care: `#000000`.

The official brand system has priority over sampled screenshots and earlier approximate tokens.

## 1. Product rule

> **Yandex Med owns the product grammar. Specialty owns the professional environment.**

This does **not** mean “keep the whole product white and recolor three buttons”.

After a specialty is selected, its identity applies to the **entire specialty workspace**:

- canvas atmosphere;
- rails/navigation context;
- priority modules;
- card borders and soft surfaces;
- selected tabs/chips;
- editorial accents;
- data/graphic treatment;
- image atmosphere.

The global Yandex Med logo/header chrome remains recognizably Yandex Med.

Specialty colors never replace semantic success / warning / error states.

## 2. Shared Yandex Med visual grammar

Preserve across every specialty:

- `YS Text Medium` for primary lines/headings;
- `YS Text Regular` for body/supporting text;
- left-aligned hierarchy;
- strong black/white contrast;
- white and negative space as structural material;
- Digital blue / AI gradient as the cross-specialty technology signature;
- rounded modular forms derived from the Yandex Med construction logic;
- simple outline icon family;
- little or no heavy shadow;
- 2–3 dominant information zones rather than equal card soup;
- cards used for meaningful grouping, not decoration.

### Brand graphic token

The Yandex Med source describes an asymmetric horizontal modular form with:

- rounded geometry;
- flowing internal transitions;
- capsule-like terminals/protrusions;
- a unified silhouette;
- the AI lavender/blue gradient.

Use its **construction logic**, not the literal logo, when a branded graphic device is appropriate.

Do not create random blobs, decorative hearts or ECG zig-zags.

## 3. Existing physician-feed grammar is authoritative for cards

Do not replace the physician feed with a generic SaaS dashboard or a giant slogan followed by uniform cards.

For the current prototype, reuse the existing feed grammar documented in `22_PHYSICIAN_FEED_UI_CONTRACT.md`:

- desktop: approximately 1–2 primary cards per viewport;
- mobile: one card plus visible continuation;
- text-first for research/guidelines;
- imagery is optional and should occupy only a minority of the card when semantically justified;
- title is 2–3 readable lines rather than clickbait;
- short summary answers “what happened?”;
- a separate **Для практики** block appears only when source-grounded practical/clinical-task data exists;
- source, type, date, currentness and actions remain visible but subordinate;
- missing fields remain absent rather than being invented.

## 4. Cardiology — PULSE / PERFUSION

### Professional atmosphere

Cardiology should evoke:

- perfusion and flow;
- pressure and rhythm;
- hemodynamics;
- echocardiography / cath-lab precision;
- cardiovascular imaging and procedural technology.

It should feel clinical, controlled and contemporary — not romantic, alarming or wellness-oriented.

### Palette v0.3

| Role | Token | HEX |
|---|---|---:|
| Yandex technology anchor | Digital blue | `#898BFF` |
| Specialty primary | Cardio Garnet | `#741E31` |
| Specialty secondary | Berry | `#B65B70` |
| Warm soft surface | Tissue Blush | `#F3E5E8` |
| Cool bridge | Cath-lab Blue | `#86A9B9` |
| Cool soft surface | Oxygen Mist | `#E7EFF3` |
| Deep editorial | Deep Wine | `#491923` |
| Warm section canvas | Cardio Canvas Warm | `#F8F0F2` |
| Cool section canvas | Cardio Canvas Cool | `#EEF4F6` |
| Text | Black care | `#000000` |

### Whole-section behavior

After Cardiology is selected:

- overall section canvas shifts to the warm-blush / cool-steel atmosphere;
- navigation rails use low-chroma Cardiology surfaces;
- priority/editorial module may use stronger Cardiology surface treatment;
- text cards remain readable, predominantly white, but inherit Cardiology border/accent hierarchy;
- official/source context may use Cath-lab Blue;
- selected professional-context states may use Garnet/Deep Wine;
- Digital blue remains recognizably Yandex Med for product links/technology cues.

The result should be perceivably Cardiology even when no content image is present.

### Anti-patterns

Do not use:

- generic bright red;
- decorative anatomical hearts;
- ECG zig-zag wallpaper;
- blood effects;
- generic hospital-blue stock language;
- random red/purple/blue per-card coloring;
- Garnet as error/danger semantics.

## 5. Oncology — CELL / PRECISION

### Professional atmosphere

Oncology should communicate:

- pathology/microscopy;
- molecular diagnostics;
- precision oncology;
- imaging;
- structured targeting/focus;
- multidisciplinary expertise.

### Palette v0.3

| Role | Token | HEX |
|---|---|---:|
| Yandex technology anchor | Digital blue | `#898BFF` |
| Specialty primary | Aubergine | `#5B4966` |
| Specialty secondary | Cellular Mauve | `#9985A6` |
| Soft primary surface | Cell Mist | `#F1EDF3` |
| Tertiary counterweight | Mineral Sage | `#A8BAB2` |
| Soft secondary surface | Mineral Mist | `#E8EFEC` |
| Deep editorial | Deep Plum | `#403646` |
| Section canvas | Oncology Canvas | `#F5F0F6` |
| Secondary canvas | Mineral Canvas | `#EDF2F0` |
| Text | Black care | `#000000` |

Mineral Sage remains tertiary; do not let it become a wellness/spa co-primary.

Oncology content must not be faked by putting Cardiology Golden Set objects under an Oncology theme.

## 6. Editorial imagery and semantic graphics

`18_EDITORIAL_IMAGE_POLICY.md` remains authoritative for real/source imagery.

Priority:

1. exact source visual;
2. source figure / publication cover / expert portrait / event photo;
3. exact uploaded clinical asset with provenance/rights state;
4. original publisher/society/university asset;
5. image-free card.

For generated semantic editorial graphics, follow information-first grammar:

- `A_VS_B`
- `CADENCE`
- `ONE_VS_MANY`
- `ROUTE_A_VS_B`
- `STACK`
- `DEVICE_METHOD`
- `PROCEDURE`
- `SEQUENCE`
- `CHANGE`
- `NO_IMAGE`

If the material does not support a concrete visual distinction, choose `NO_IMAGE`.

Brand character is subordinate to clinical meaning.

## 7. Entry/onboarding flow

Do not invent a new specialty chooser when the existing physician-flow already exists.

Reuse:

1. **What Yandex Med / Feed is** — short product value introduction;
2. **Какая у вас специальность?** — main specialty selection, with future verified-profile reuse;
3. **Safety reminder** — reference tool, physician makes decisions, verify important facts, no patient personal/secret data;
4. then enter the chosen product mode/shell.

The specialty chooser should be compact and functional, not a marketing gallery of giant specialty cards.

## 8. A / B / C consistency

A / B / C share:

- Yandex Med brand grammar;
- YS Text typography;
- same Cardiology specialty environment;
- same content-card grammar;
- same editorial-image policy;
- same semantic status system;
- same canonical Golden Set.

They may differ in navigation, grouping, density and working model — not in brand quality.

## 9. Acceptance criteria

Reject the implementation if:

- only CTAs are specialty-colored while the workspace remains generic;
- YS Text is silently replaced by another typeface;
- the home screen is mostly one generic slogan;
- the feed becomes a matrix of uniform little cards;
- real long titles are truncated into meaning loss;
- images dominate research/guideline cards;
- Cardiology and Oncology differ only by one chip color;
- semantic colors are confused with specialty colors;
- the system invents medical data to fill a layout;
- A/B/C appear to be separate brands.

A successful screen should read in this order:

1. **Yandex Med**;
2. **the selected medical specialty**;
3. **the current professional task/content**;
4. **the chosen A/B/C working mode**.
