# Workbench Component Reuse Contract

Status: **authoritative for Phase 2 pixel-first implementation**  
Date: **2026-10-18**

## Decision

Do not invent another visual component system for KARDIO.

Reuse the component grammar from the earlier Med Research Workbench / physician-feed project and layer specialty identity on top of it.

Reference product:
- published reference: `https://med-research-workbench-v2.elsatoday.chatgpt.site/`
- accessible source precedent: `timchenkoliza/med-feed-prototype-4`

Relevant source files:
- `src/config/design-contract.ts`
- `src/app/app.css`
- `src/app/App.tsx`
- `src/app/components/Card.tsx`
- `src/app/components/CardMenu.tsx`
- `src/app/components/Overlay.tsx`
- `src/components/common/EmptyState.tsx`
- `src/components/common/Toast.tsx`

The current KARDIO prototype remains plain HTML/JS. We reuse the **design contract and component behavior**, not the old mock data or feed business logic.

## Reused invariants

### Typography
- one YS Text family; YS Display only for display hierarchy when available;
- scale: 12 / 13 / 15 / 17 / 20 / 24 / 30 / 36;
- no 54–68 px landing-page headlines inside the professional workspace;
- real long medical titles wrap naturally.

### Spacing
4-based scale only:
- 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 56.

### Radius
Only four radius roles:
- control — 12 px;
- card — 16 px;
- sheet — 20 px;
- pill — 999 px.

Do not create per-component random radii.

### Shadow
Only two elevation levels:
- card — `0 1px 2px rgba(0,0,0,0.04)`;
- overlay — `0 24px 64px rgba(0,0,0,0.18)`.

Hierarchy should primarily come from spacing, borders, background and typography rather than shadow.

### Layout
Reference geometry:
- desktop container — 1440 px;
- left sidebar — 248 px;
- compact sidebar — 224 px;
- right rail — 288 px;
- desktop gutter — 28 px;
- header — 64 px;
- feed/card gap — 24 px;
- mobile anchor — 390 px;
- tablet anchor — 768/834 px;
- desktop anchor — 1440 px.

## Reused component grammar

Map the old Workbench primitives into the current KARDIO runtime:

| Workbench primitive | Current KARDIO use |
|---|---|
| App/Shell | shared Yandex Med header + A/B/C body |
| Specialty selector | first dividing screen before A/B/C |
| Search | shared rounded professional query field |
| Left rail | Toolbelt / Workspace navigation |
| Right rail / railcard | provenance and source context |
| Card | Golden Set content object |
| CardMenu/actions | save/pin/source actions |
| Overlay / Sheet | specialty and shell selector |
| Badge / Tag | content type, trust, date and editorial state |
| EmptyState | missing source-grounded capability |
| Toast | lightweight state confirmation |

Do not reuse obsolete patient/EHR interactions from any earlier project.

## Specialty-first dividing screen

The entry sequence is now:

1. **Choose specialty**;
2. **Choose working shell A/B/C**;
3. enter the real-content product.

This order matters: specialty is a product context; A/B/C is an interaction architecture inside that context.

### Cardiology
- active now;
- canonical Golden Set exists;
- `PULSE / PERFUSION`;
- FLOW visual physics;
- may proceed to A/B/C.

### Oncology
- visual identity may be previewed on the dividing screen;
- `CELL / PRECISION`;
- CLUSTER / TARGET visual physics;
- **must not enter A/B/C using the Cardiology Golden Set**;
- activate only when a source-grounded oncology canonical dataset exists.

This prevents visual theming from silently falsifying content context.

## Theme architecture

The base components remain stable. Only specialty tokens may change:

```css
--sp-primary
--sp-secondary
--sp-soft
--sp-bridge
--sp-bridge-soft
--sp-deep
```

Implementation files:
- `phase2/workbench-contract.css` — reused Workbench foundations;
- `phase2/kardio-pixel.css` — current pixel-first component/layout layer;
- `phase2/specialty-theme.js` — specialty-first chooser behavior;
- `context/19_SPECIALTY_VISUAL_IDENTITY.md` — art direction;
- `context/20_SPECIALTY_VISUAL_TOKENS.json` — specialty palette truth.

Do not hard-code specialty HEX values inside individual cards or shell components.

## Pixel-first rejection rules

Reject implementation if any of the following occurs:

- giant marketing/landing-page typography replaces Workbench typography;
- Toolbelt gets a separate dark visual language unrelated to the other shells;
- A/B/C use different radius, spacing or color systems;
- specialty color is applied randomly per component;
- every card receives a different accent color;
- generic purple is used for every important element regardless of specialty;
- status green/red is repurposed as decorative specialty color;
- oncology styling is shown over cardiology content;
- placeholder imagery is introduced to improve visual balance.

## QA

Pixel-first review must compare 390 / 768(or 834) / 1440 and explicitly inspect:
- header;
- specialty selector;
- A/B/C selector;
- search;
- navigation rails;
- text-only Golden Set cards;
- the one real-image card;
- status/trust/source badges;
- provenance rail;
- empty states;
- long-title wrapping.

Do not call the build pixel-perfect until those screens have been rendered and visually inspected.