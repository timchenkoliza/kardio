# KARDIO — Pixel-first real-content QA pass

Status: **implemented in active Phase 2 render path; browser screenshot comparison still required before merge**.

Date: 2026-10-18.

## Scope

This pass does not change:
- the three approved shells A/B/C;
- Golden Set facts;
- ranking logic;
- shared state;
- source/currentness/version logic;
- semantic image matching policy.

It only refines the active cardiology visual layer after real-content binding.

Active entry point:
- `phase2/kardio-app.html`

Final CSS order now ends with:
- `phase2/kardio-pixel-polish.css`

The final polish layer is explicitly scoped to:
- `body[data-specialty="cardiology"]`

It must not overwrite the oncology placeholder identity.

## Problems found in the previous active stack

The active JavaScript had already moved to the newer `feed-*` / `spotlight-*` render grammar, while several visual layers still carried earlier card-dashboard assumptions.

Visible risks from source inspection:
- too many large rounded cards;
- pill-like tabs / controls / status labels competing for attention;
- decorative specialty gradients carrying more weight than the medical content;
- search presented as a decorative pill instead of a primary professional control;
- clinical images using `object-fit: cover`, which risks clinically meaningful cropping;
- dense real medical titles competing with oversized decorative container geometry;
- inconsistent visual grammar between spotlight, feed cards, source/status metadata and shell navigation.

## Implemented corrections

### 1. Typography

A controlled hierarchy is enforced for the active cardiology path:
- product/header text remains compact;
- feed title: ~32 px desktop;
- editorial lead: ~25–32 px;
- standard content title: ~19 px;
- featured content title: ~23 px;
- body/summary: 12.5–15 px by role;
- metadata/status: ~9.5–11 px.

YS Text remains authoritative.

Long medical titles are not line-clamped in the main card title.
They use natural wrapping plus `overflow-wrap:anywhere` / `hyphens:auto` safeguards.

### 2. Editorial hierarchy

The previous large rounded spotlight card is converted into an editorial lead section using restrained top/bottom rules.

Related items remain visually subordinate and use separators rather than individual card containers.

### 3. Feed cards

Standard feed objects now behave as an editorial list:
- flat background;
- no card shadow;
- no 24 px decorative radius;
- one divider between objects;
- source/type/date first;
- title and summary receive the dominant reading hierarchy;
- save/pin/source actions remain secondary.

This is intended to handle long source-grounded Russian medical titles without turning the feed into a wall of containers.

### 4. Status metadata

Current / review / superseded / archive / official remain explicit.

Their shape is changed from large pills to compact low-radius labels so provenance/status remains legible without becoming the main visual motif.

### 5. Search and quick jobs

Search remains a primary entry control but is no longer a full pill.

The four quick jobs are rendered as one compact segmented utility row on wide screens and a 2×2 grid on tablet/mobile widths.

No new medical content was added to empty calculator/drug/VMP capability states.

### 6. Clinical image handling

For the semantically matched echocardiography object:
- media uses `object-fit: contain`;
- aggressive clinical cropping is explicitly avoided;
- desktop keeps image beside the content where space permits;
- mobile stacks image and content;
- image-free remains the default for unmatched objects.

### 7. Shell consistency

All three shells still consume the same shared render/data layer.

A — Search-first Navigator:
- editorial feed remains the dominant center column.

B — Professional Toolbelt:
- retains a compact utility rail;
- side provenance rail disappears when space is insufficient.

C — Knowledge Workspace:
- retains topic navigation as the structural difference;
- collection tiles are reduced to restrained knowledge containers rather than dashboard cards.

## Responsive contract encoded in this pass

### ~1440 px
- A: centered ~840 px reading/feed column;
- B: compact left tool rail + reading column + provenance side rail;
- C: topic navigation + reading column + context side rail.

### ~768–900 px
- quick jobs become 2×2;
- spotlight related items stack;
- clinical image width contracts;
- B/C right-side rails disappear before primary content is compressed.

### <=720 px
- B/C desktop rails collapse to the existing bottom navigation;
- feed becomes one column;
- clinical image stacks and uses contain-fit;
- source actions wrap naturally;
- typography reduces without introducing a separate mobile font zoo.

### <=430 px
- shell label is hidden before primary actions;
- filter row becomes horizontally scrollable;
- source action may take a full row;
- long titles remain visible rather than truncated.

## Source-level checks completed

VERIFIED:
- final polish stylesheet is loaded after the existing visual layers;
- final stylesheet is scoped to cardiology only;
- Golden Set render/data path remains unchanged;
- no content facts were edited;
- A/B/C render logic remains unchanged;
- current/review/superseded/archive labels remain present;
- no-image fallback remains valid;
- semantically matched clinical image uses a no-crop/contain rule in the final layer;
- mobile/tablet/desktop breakpoints are explicitly encoded.

## Browser verification status

NOT VERIFIED in this execution environment:
- pixel-level screenshots of the live repository build at 390 / 768 / 1440;
- real combined CSS cascade as rendered by the user's browser;
- exact YS Text network font load in an offline/headless environment;
- scroll-depth screenshot comparison for A/B/C;
- Vercel Preview.

Local Chromium exists in the execution container, but navigation to both `file://` and localhost is blocked by the environment administrator. The pass therefore must not be described as screenshot-verified.

## Merge gate

Do not merge the draft PR until the user opens the branch locally and checks at minimum:
- A/B/C home at desktop width;
- A/B/C around 768 px;
- A/B/C around 390 px;
- the long-title search/guideline states;
- `fact-ar-echo-2025` image treatment;
- at least one superseded object;
- at least one needs-review object.

Any visual fix after that review should modify the final cardiology polish layer first rather than reintroducing conflicting rules into multiple older CSS files.
