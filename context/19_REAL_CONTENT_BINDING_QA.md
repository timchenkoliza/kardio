# KARDIO — Real Content Binding QA

Status: **real Golden Set bound to active Phase 2 prototype; pixel-level browser QA still pending**.

Date: 2026-10-18.

## Active entry point

- `phase2/kardio-app.html`

The active render path no longer uses the old hard-coded demo `catalog` / `sources` arrays.

All three shells consume the same Golden Set runtime:

1. Search-first Navigator
2. Professional Toolbelt
3. Knowledge Workspace

## Data integrity — VERIFIED

Canonical user data:
- content objects: **54**
- source-registry objects: **18**
- fixed cross-shell evaluation slice: **24**
- evaluation IDs missing from canonical data: **0**
- broken `parent_document_id` / `supersedes_id` / `superseded_by_id` references: **0**
- evaluation objects with real `source_url`: **24 / 24**

Runtime transport:
- canonical JSON is normalized, gzip-compressed and split into five generated JS chunks for local browser loading;
- `data/cardio_goldenset_content_db_v2.manifest.json` records raw and normalized hashes;
- object equivalence between the user-supplied JSON and the normalized runtime JSON was verified before binding.

## Evaluation-slice composition — VERIFIED

24 objects:
- 6 clinical guidelines
- 5 video lectures
- 4 journal-news items
- 4 clinical cards
- 2 professional-society news items
- 1 TV-studio item
- 1 project item
- 1 membership-service item

Trust layer:
- 11 official
- 8 professional
- 5 expert

Freshness/currentness source states include:
- 15 current
- 3 needs-date-check
- 2 superseded
- 2 legacy
- 1 needs-version-check
- 1 current-in-export

The UI resolves these source states into explicit current / review / superseded / archive presentation states rather than hiding uncertainty.

## Image coverage — VERIFIED at content-policy level

Evaluation slice:
- semantically matched real uploaded image: **1**
- intentionally image-free objects: **23**

Current matched image:
- `fact-ar-echo-2025` → real clinical echocardiography examination photo
- status: `needs_review`
- usage: prototype only until provenance/rights are confirmed

No donor-heart, CT, ECG meme, device image, angiography video, MR cine, Pinterest screenshot or synthetic 3D asset was force-matched to an unrelated Golden Set object.

The image-free fallback is intentional and preferred to irrelevant photography.

## Search / selectors — VERIFIED

Prototype search uses normalized metadata, not only visible card titles.

Searchable fields include, where present:
- title
- card summary
- topic / canonical topic
- content type / format
- author / expert
- organization
- source metadata
- category / subcategory
- tags
- clinical task

Filters support:
- content type
- trust layer
- status
- year

## A / B / C fairness — VERIFIED

All shells begin from the same 24 Golden Set object IDs.

Allowed shell differences:
- ranking weights
- grouping
- navigation
- density
- card composition
- progressive disclosure

Canonical facts are not forked per shell.

Shared state persists across shells:
- query
- recent
- saved
- pinned
- filters

## Data gaps — EXPLICIT, NOT FABRICATED

Golden Set v2 currently does not provide sufficient source-grounded canonical objects for:
- calculators
- drug/reference database
- referral / VMP routing

These capabilities render an explicit data-gap state instead of fake medical content.

## Static/runtime QA — VERIFIED

- JavaScript syntax check: passed for content runtime and active app script.
- Golden Set loader count contract: 54 content + 18 sources.
- fixed evaluation slice: 24 / 24 resolved.
- source links in evaluation slice: 24 / 24.
- superseded links: no broken target references found.
- content runtime boot tested against canonical JSON.
- real-image resolver returns exactly one current evaluation image.

## Browser visual QA — NOT VERIFIED

Still required before merge/pixel-perfect completion:
- real browser screenshots at ~390 px
- ~768–1024 px
- ~1440 px
- several scroll depths for A / B / C
- long-title wrapping
- exact card density
- typography rhythm
- source-badge collision/overflow
- mobile image crop
- no horizontal overflow
- console/runtime errors in the target browser

The current execution environment did not provide a reliable permitted browser-render path, so these are not claimed as passed.

## Next stage

Do **not** redesign A/B/C.

Open the real-content prototype locally, review it with real Golden Set data, then perform the pixel-first pass on typography, geometry, responsive behavior and state polish.
