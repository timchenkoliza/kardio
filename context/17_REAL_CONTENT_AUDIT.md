# KARDIO — Real Content Audit

Status: **authoritative input audit before UI binding**.

Date: 2026-10-18.

## Input audited

Human-readable source: `cardio_goldenset_content_db_v2.xlsx` supplied by the user.

The workbook contains:
- `OVERVIEW`
- `CONTENT_GOLDEN`
- `SOURCE_REGISTRY`
- `SCHEMA`
- `QA_RULES`

## Dataset shape

Golden content objects: **54**.

Registered sources: **18**.

Content types:
- 11 clinical guidelines;
- 18 video lectures;
- 5 journal/news objects;
- 1 project;
- 4 Society news objects;
- 2 TV-studio objects;
- 1 webinar;
- 4 membership-service objects;
- 8 clinical cards.

Currentness:
- 18 current;
- 31 require some form of review/currentness/date/version check;
- 5 are explicitly non-current / superseded / archive according to the workbook state.

All 54 objects retain `rights_status = needs_rights_review` in this prototype dataset.

## Missing metadata that UI must survive

The dataset intentionally does not fabricate missing fields.

Observed missingness:
- `publication_date`: absent for 41/54 objects;
- `publication_year`: absent for 13/54;
- `author_expert`: absent for 36/54;
- `source_asset`: absent for 35/54.

`source_url` exists for all 54 content objects, but in many cases it is a source/section URL rather than an item-level deep link. UI must not imply a deeper source resolution than the data supports.

## Versioning is real, not decorative

The dataset contains explicit supersession chains, e.g. older and newer clinical-guideline objects linked through `supersedes_id` / `superseded_by_id`.

UI requirement:
- keep old objects accessible when useful;
- visually state `Есть более новая версия` for superseded material;
- resolve the replacement by ID;
- never silently present a superseded object as current.

## Trust/content classes

Observed `trust_layer` values in the content table:
- official;
- expert;
- professional.

Source registry additionally contains commercial/pharma and other source roles. The production adapter must keep:
- official/guideline;
- professional society;
- journal/editorial;
- expert/education;
- commercial/pharma;
- user-added/community

visually and behaviorally distinct when those classes enter the rendered set.

## Golden Set vs current prototype

The current `phase2/kardio-app.html` still contains hard-coded placeholder arrays and strings such as:
- HSN demo guideline object;
- fixed RKO update;
- fixed source list;
- demo tools;
- demo recent/saved/pinned values.

Those placeholders are architecture scaffolding only. They must be replaced by selectors over the Golden Set/shared content layer. The three shells must not create separate content copies.

## Fixed cross-concept evaluation slice

Initial evaluation slice: **24 Golden Set objects**.

Mix:
- 6 clinical guidelines;
- 5 video lectures;
- 4 journal/news objects;
- 4 clinical cards;
- 2 Society news objects;
- 1 TV-studio object;
- 1 project;
- 1 membership-service object.

State mix includes:
- current;
- superseded;
- needs-version/date review;
- legacy;
- current-in-export.

The same 24 IDs must be rendered by A, B and C before concept-specific ranking/grouping is applied.

## Hard implementation order

1. Canonical Golden Set JSON.
2. Normalization/adapter layer.
3. Shared selectors/search/filtering.
4. Fixed evaluation-slice manifest.
5. Editorial image enrichment layer.
6. Replace hard-coded prototype content.
7. Only then perform real-content visual QA and pixel-level polish.

## No-redesign guard

This audit does not authorize changes to the approved A/B/C product models. Content integration may change card height, overflow handling, progressive disclosure and state rendering, but not the product logic of the three shells.