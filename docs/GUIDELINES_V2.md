# Guidelines v2 — versioned recommendation diff

Status: implemented on `feature/pharma-content-studio`.

## Goal

The `guidelines` agent should answer **what changed clinically**, not merely announce that a new document exists. It keeps old/new version context, source provenance and an explicit comparison basis so metadata is never presented as a full-text clinical diff.

## Comparison basis

Every guideline result declares one of four modes:

- `available_text_pair` — recommendation extracts for both previous and current versions are present, so a deterministic old/new comparison is possible;
- `curated_delta` — a real public source explicitly describes changes, but the product does not possess both guideline full texts; this is a verified change summary, not a post-by-post full-text diff;
- `current_text_only` — recommendation extracts exist only for the current version; they can be surfaced, but cannot prove what the previous version said;
- `metadata_only` — only version, currentness and ICD metadata can be compared.

The product must not relabel the last three modes as full-text comparison.

## Versioned model

A `GuidelineVersionDocument` contains a version, source URL and a list of recommendation records. A recommendation record may contain only source-bound values:

- recommendation text;
- recommendation class when explicitly present;
- evidence level when explicitly present;
- patient scope when explicitly stated;
- practice impact when the source directly supports an action.

`diffGuidelineDocuments(previous, next)` emits:

- `NEW` — recommendation id exists only in the new version;
- `CHANGED` — text, recommendation class or evidence level changed;
- `REMOVED` — recommendation id exists only in the old version;
- `UNCHANGED` — source-bound values are identical.

No semantic guess is used to turn unrelated cards into a change. The catalog adapter pairs deterministic recommendation-card identities only when both version sets are actually present.

## Runtime sources

### RKO / catalog

For a `supersedesId` chain the service looks for clinical recommendation cards associated with both publication years.

- cards on both sides → `available_text_pair`;
- only current cards → `current_text_only`;
- no comparable recommendation text → `metadata_only`.

Metadata year/status/ICD deltas are retained separately and never promoted to a clinical recommendation delta.

### ESC curated snapshot

The existing ESC snapshot has source quotes for each asserted change. These become `curated_delta` records. The source quote remains the evidence support text. Patient scope, class and practice impact are added only for statements where the quoted source explicitly supports them.

Examples currently supported by source text include the 2026 ESC HF statements about in-hospital SGLT2 initiation after stabilization, semaglutide/tirzepatide Class IIa in the stated HF/EF/BMI population and the SBP target in the stated population.

## Output semantics

A guideline result persists the entire structured delta in `guidelineDiff.*` attributes together with counts of new/changed/removed/unchanged/actionable recommendations. Existing cards surface a compact delta line and a practice-oriented summary. The evidence disclosure remains the place to inspect the exact source claims and provenance.

A result with `curated_delta` explicitly says that it is a verified summary of change and **not** a line-by-line comparison of both full texts. A result with `metadata_only` explicitly says that only metadata were compared.

## Trust rules

1. Missing old text means no `before` recommendation text is invented.
2. Missing class or level means the corresponding field stays null.
3. `UNCHANGED` is emitted only when paired source-bound text/class/level are actually equal.
4. A class transition can only come from values explicitly present in the compared records.
5. Practice impact is not generated from medical background knowledge; it must be directly supported by the available source statement.
6. Source standing and FactCheck remain shared mandatory gates.

## Downstream use

The same `guideline_change` results remain consumable by:

- `Что нового для меня`;
- `Моё обучение`;
- future Research synthesis and Journal Club flows.

The structured delta is stored on the result instead of creating a new user-facing agent or a parallel guideline data model.

## Next capability boundary

The next improvement should be **live/refreshable guideline-document retrieval** for sources where the product is legally and technically allowed to retrieve both versions. Once both source documents are available, recommendation segmentation can move more records from `curated_delta` / `metadata_only` into `available_text_pair`. Until then the UI must preserve the comparison-basis distinction.
