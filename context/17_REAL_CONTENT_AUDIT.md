# KARDIO — Real Content Audit

Status: **authoritative real-content baseline for the current multi-shell prototype**.

Date: 2026-10-18.

## Input audited

Human-readable source: `cardio_goldenset_content_db_v2.xlsx` supplied by the user.
Canonical runtime representation is derived without editorial rewriting of medical facts.

## Canonical inventory

- 54 source-grounded content objects
- 18 registered sources
- 24-object fixed cross-shell evaluation slice

The same 24 objects must initially be rendered by:
- Search-first Navigator
- Professional Toolbelt
- Knowledge Workspace

The shells may rank, group, navigate and compose differently. They must not fork facts.

## Current implementation status

Real-content binding is now **IMPLEMENTED** in:

- `phase2/kardio-app.html`
- `phase2/content-runtime.js`
- `phase2/kardio-app.js`
- `phase2/kardio-real.css`
- `data/cardio_goldenset_loader.js`
- `data/goldenset-chunk-01.js` … `goldenset-chunk-05.js`
- `data/cardio-evaluation-slice-v1.bundle.js`
- `data/content-image-enrichment.bundle.js`

The previous hard-coded demo `catalog` / `sources` arrays are no longer in the active render path of `phase2/kardio-app.html`.

## Required data states

UI must preserve rather than clean away:

- current
- needs review
- superseded
- archive / legacy
- missing author
- missing publication date
- missing source asset
- source-level URL rather than invented deep link
- unresolved rights status

Missing metadata is a valid state. Do not hallucinate it to make cards look complete.

## Currentness/version behavior

Older recommendations remain visible when they are present in the Golden Set.
If `superseded_by_id` exists, the UI must:
- mark the object as superseded;
- expose the newer object;
- never silently present the old version as current.

## Search model

Prototype search may use factual fields already present in the canonical object, including:
- title
- card summary
- topic / canonical topic
- content type
- author / expert
- organization
- source metadata
- tags
- category / subcategory

Search ranking must not mutate canonical fields.

## Capability gaps

The current Golden Set does **not** yet provide complete source-grounded canonical objects for:
- calculators;
- drug/reference entries;
- referral / VMP navigation.

These remain legitimate product capabilities but must render as explicit content gaps until grounded data is supplied. Do not fabricate medical entries.

## Editorial images

Image enrichment is separate from canonical facts.

Current prototype rule:
- exact semantic match first;
- provenance and rights tracked separately;
- image-free card preferred to weak stock match.

Only one uploaded clinical image is currently attached to the evaluation slice: the real echocardiography examination photo for `fact-ar-echo-2025`.
It is prototype-only until rights/provenance are verified.

Pinterest/moodboard screenshots are reference-only and are never rendered as content.
Other uploaded donor-heart, CT, ECG, device and video assets remain unassigned until an exact content/provenance match is established.

## Shared state

Across A/B/C the following are common:
- canonical objects;
- source URLs;
- saved IDs;
- pinned IDs;
- recent IDs;
- query state;
- trust/currentness metadata.

Switching shell must not duplicate or rewrite these objects.

## Verification status

VERIFIED:
- Golden Set runtime integrity contract: 54 content objects / 18 sources;
- fixed 24-object evaluation manifest exists;
- real-content render path is wired into all three shells;
- demo arrays are removed from active `phase2/kardio-app.html` render path;
- source links/currentness/review/superseded states are implemented;
- explicit empty states are used for unpopulated capabilities;
- semantic image policy is implemented.

IMPLEMENTED BUT NOT VISUALLY VERIFIED:
- responsive rendering at 390 / 768 / 1440;
- long-title wrapping and exact visual density;
- final typography and geometry;
- detailed A/B/C pixel consistency.

NOT VERIFIED:
- browser screenshot regression in this execution environment;
- Vercel Preview deployment.

Final pixel-first visual QA starts only after opening the real-content prototype in a browser and inspecting the anchor viewports.
