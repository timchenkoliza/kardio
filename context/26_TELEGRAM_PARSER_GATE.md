# Telegram export parser gate

Status: **ACTIVE INGESTION CONTRACT**  
Date: 2026-10-18

## Purpose

The raw Google Drive inventory is operational storage metadata. Parsing a Telegram Desktop export must not automatically turn provider files/folders or posts into canonical medical knowledge.

The flow is:

`raw_archive_artifact(messages.html) → deterministic parser → distribution-post candidates → entity/media/link resolution → review/evidence → selective ontology promotion`

## Parser output

The parser may extract only source-grounded fields from the Telegram HTML export:

- source registry ID and specialty scope;
- Telegram message ID and deterministic stable ID;
- post vs service-message kind;
- raw publication timestamp plus a normalized value and explicit timestamp basis;
- source-grounded author/sender display name;
- plain post text;
- hashtags;
- hyperlinks classified as external, internal navigation, local artifact or other;
- relative media references from both anchor hrefs and non-user-avatar image src values;
- SHA-256 of the source message fragment.

The parser does not infer diagnosis, clinical truth, authority, rights, professional topic, person identity, event identity, research-study identity, currentness or product eligibility.

## Timestamp semantics

The real `cardiology_channel_01` Telegram Desktop export uses timestamps such as:

`11 March 2022, 15:28:27`

This observed format contains no timezone/UTC offset. The parser therefore stores:

- the exact `publishedAtRaw` string;
- a normalized wall-clock value such as `2022-03-11T15:28:27`;
- `publishedAtBasis = source_local`.

It must **not** silently append `Z`, assume UTC, or assume Moscow time. If an export explicitly includes an offset (for example `18.10.2026 12:34:56 UTC+03:00`), the parser may normalize it to an absolute ISO instant and marks `publishedAtBasis = offset_explicit`.

Unknown/unrecognized timestamp formats remain explicit `unknown` rather than receiving inferred timezone semantics.

## Promotion boundary

A parsed post is initially a **candidate distribution record**, not canonical professional knowledge.

Examples:

- a post linking to a guideline does not become the guideline;
- a post announcing a webinar may later resolve to a `professional_event`;
- a named speaker may later resolve to a `person` only with source-grounded identity evidence;
- an attached photo may later resolve to `media_asset`, but rights remain independently unknown until reviewed;
- a post mentioning a disease/topic does not automatically create a canonical clinical concept.

`distribution_post` becomes an ontology entity only in the promotion phase, not during raw parsing.

## Patient-data boundary

The product has no patient node and no patient-specific workflow. Parsed raw exports must never be promoted into patient records, encounters, schedules, patient tasks or patient-specific diagnostic/device state.

If a future export contains case material or identifiable patient information, that material stays quarantined from product promotion until an explicit privacy/safety review path exists.

## Determinism

Given the same `messages.html` bytes and source registry entry, parser output must be deterministic. Stable identity is:

`<source_registry_id>:message:<telegram_message_id>`

The raw-fragment SHA-256 provides change detection without pretending that a parsed post is immutable canonical knowledge.

## Current source status

- `cardiology_channel_01`: `messages.html` present; parser inspection allowed.
- `cardiology_channel_02`: export folders are present but root `messages.html` is currently missing; do not synthesize or infer posts.
- `oncology_channel_01`: empty in the currently connected Drive view; blocked.
- `oncology_channel_02`: empty in the currently connected Drive view; blocked.

## Acceptance gate before database promotion

1. parser unit tests pass;
2. parser is deterministic;
3. `cardiology_channel_01` can be inspected read-only from the real Drive export;
4. observed Telegram Desktop timestamp formats are normalized without inventing timezone semantics;
5. no parser run changes ontology counts;
6. no parser run writes canonical content;
7. source/message IDs remain stable;
8. media stays relative/provenance-linked and carries no inferred usage rights;
9. internal hashtag/navigation links are distinguishable from external URLs;
10. missing Cardiology/Oncology exports remain explicit missing states rather than fallback data.
