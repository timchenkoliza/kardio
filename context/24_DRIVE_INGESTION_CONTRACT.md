# KARDIO — Google Drive Raw Archive Ingestion Contract

Status: implementation contract for raw external-source ingestion.  
Date: 2026-10-18

## 1. Purpose

Google Drive is used as a **raw source archive** for exported professional content and media. It is not the application database and must never become the production CDN.

The application database remains PostgreSQL. The ingestion path is one-way:

`Drive raw archive → ingestion provider → ExternalArtifact / candidate nodes → evidence/review → PostgreSQL → product projections`

Production rendering reads application-controlled metadata and approved product media, not Google Drive URLs.

## 2. Current archive root

Root folder ID:

`1JnLZvA-yab8bkmRrq8juovMS8t4ld6cR`

The machine-readable registry is stored in:

`data/drive-source-registry.json`

Known top-level collections:

- Telegram exports
- journals
- events
- experts

Known Telegram export folders are specialty-scoped and include separate Cardiology and Oncology archives.

## 3. Archive semantics

A Drive folder/file is not automatically a clinical source or canonical knowledge object.

Drive items first become `external_artifact` identities with provenance:

- Drive file/folder ID;
- archive collection;
- specialty scope where explicitly known;
- source/export identity;
- MIME/type metadata;
- original filename;
- parent folder identity;
- captured/synced time;
- checksum when bytes are materialized.

For Telegram Desktop HTML exports, `messages.html` is the primary export artifact. Related folders such as `photos`, `video_files`, `files`, `gifs`, `round_video_messages`, `thumbs`, and `webpage_thumbs` remain children of the same raw export.

`css`, `js`, generated thumbs and other export-support files are transport artifacts unless later evidence proves product value.

## 4. Provider boundary

The ingestion layer must depend on a provider interface rather than direct Google Drive calls.

A provider must support capabilities equivalent to:

- list children of a folder;
- fetch metadata for one item;
- read UTF-8 text artifacts;
- materialize binary artifacts to application-controlled temporary storage when explicitly required;
- preserve Drive IDs and parent relationships.

Implementations may later include:

1. `GoogleDriveApiProvider` for scheduled server-side sync;
2. `LocalMirrorProvider` for a Google Drive Desktop/local mirror during development.

Both providers must yield the same normalized `RawArchiveItem` contract.

## 5. Credentials and security

Never commit Drive credentials, OAuth tokens or service-account secrets.

Environment configuration may reference:

- archive root ID;
- provider mode;
- local mirror path;
- credentials file path or secret-manager reference.

Drive folder IDs themselves are locators, not secrets, but they still must not be treated as product media URLs.

## 6. Specialty isolation

The current Telegram registry explicitly scopes export folders to Cardiology or Oncology.

Rules:

- folder specialty is ingestion scope, not clinical-authority proof;
- Cardiology raw artifacts cannot silently appear on Oncology surfaces;
- Oncology exports produce candidate ontology objects/relations only until primary sources and editorial/clinical authority are resolved;
- no cross-specialty fallback is allowed.

## 7. Telegram future mapping

Do not parse Telegram content before the ontology has been validated against representative samples.

Future mapping:

`messages.html → external_artifact → distribution_post candidates`

A distribution post may:

- `published_by → source`
- `concerns → topic`
- `references → professional knowledge candidate`
- `features_person → person`
- `contains_asset → media_asset`

If the post links to a primary paper/guideline/event, the linked object may become the authoritative/canonical professional node after evidence and review. The Telegram post remains a distribution object.

## 8. Media rules

Raw media keeps provenance back to Drive/export/post.

Media eligibility requires the centralized ontology media policy. Semantic relevance and usage rights are independent.

Do not:

- render unknown-rights media in production;
- replace missing rights with generic stock imagery;
- store Google Drive sharing URLs as canonical media URLs;
- assume that presence in a channel export grants redistribution rights.

## 9. Sync states

Each raw artifact sync should eventually expose state equivalent to:

- discovered
- metadata_synced
- bytes_materialized
- parsed
- matched
- needs_review
- accepted
- rejected

These are ingestion workflow states, not medical truth states.

## 10. Database boundary

PostgreSQL stores normalized ingestion metadata and ontology/evidence records. Raw Drive bytes do not belong in ordinary relational columns.

Recommended persistent records:

- archive source registry/version;
- external artifact metadata;
- checksum/materialization metadata;
- parser version;
- candidate node/edge mappings;
- evidence/review results;
- approved media storage locator after rights clearance.

## 11. Initial implementation gate

Before writing a Telegram parser, validate the ontology against at least:

- 5 Cardiology posts;
- 5 Oncology posts;
- mixed types where possible: research, guideline/update, expert, event, video/media, commercial/editorial content.

If the ontology cannot represent the samples without hacks, update the ontology first. Parser implementation starts only after that gate.
