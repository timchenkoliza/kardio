# Distribution candidate staging gate

Status: **ACTIVE INGESTION CONTRACT**  
Date: 2026-10-18

## Purpose

The Telegram parser has passed the real-export read-only gate. The next layer persists parsed posts as **distribution candidates** without promoting them into the professional ontology.

The flow is:

`raw_archive_artifact(messages.html) → deterministic parser → distribution_post_candidates → link/media resolution → review → selective ontology promotion`

This layer exists to make source observations queryable and reviewable while keeping the professional-world graph clean.

## Persistence boundary

`distribution_post_candidates` is operational/editorial staging data.

A candidate is **not**:

- a guideline;
- a research study;
- a clinical concept;
- a canonical event;
- a verified expert/person;
- an approved media asset;
- a canonical `distribution_post` ontology node.

No candidate sync may write `ontology_nodes`, `ontology_edges`, `evidence_records`, `node_state_facts`, or `ontology_domain_events`.

## Identity and provenance

Candidate identity is deterministic:

`<source_registry_id>:message:<telegram_message_id>`

Each candidate keeps:

- source registry ID;
- specialty scope from the source registry;
- source raw-archive artifact ID (`messages.html` inventory row);
- Telegram message ID;
- source-grounded author display name;
- body text;
- hashtags;
- raw fragment SHA-256;
- parsed timestamp with explicit timestamp basis;
- source-presence state;
- review state;
- optional future promoted ontology node ID.

Links and local media references are persisted separately with their source order.

## Timestamp semantics

The parser must not invent timezone information.

- explicit UTC offset → `published_at_instant` (`timestamptz`);
- export wall-clock with no timezone → `published_at_local` (`timestamp without time zone`);
- unparseable/missing → both null, basis `unknown`;
- source text always remains in `published_at_raw`.

## Source disappearance

Candidate rows are never hard-deleted because a later export no longer contains the message.

On every source sync:

1. previously observed candidates for that source are provisionally marked `missing`;
2. candidates observed in the current export are marked `present` and update `last_seen_at`;
3. links/media are refreshed only for currently present posts;
4. last-observed link/media snapshots for missing candidates remain available for audit/review.

This is source-presence state, not clinical currentness.

## Source changes and review

The raw fragment SHA-256 is the change detector.

- same identity + same hash → unchanged;
- same identity + changed hash → parsed source fields update;
- if the changed candidate had moved beyond raw `parsed` review state, it returns to `needs_review`;
- existing promotion linkage is not silently deleted or re-promoted.

No source edit may automatically mutate canonical ontology facts.

## Cardiology / Oncology isolation

Candidate specialty comes only from the registered source folder.

- `cardiology_channel_01` candidates are Cardiology;
- no Oncology candidate is synthesized from Cardiology;
- missing/empty Oncology exports remain explicit missing source state;
- future cross-specialty applicability requires a separate evidence-backed resolution step.

## Acceptance gate

Before entity resolution or ontology promotion:

1. migration is additive and non-destructive;
2. parser/unit/type/lint checks pass;
3. real `cardiology_channel_01` candidate sync completes;
4. candidate count equals parsed post count for the current export;
5. link/media counts equal parser output;
6. second identical sync reports zero inserts/changes and all candidates unchanged;
7. ontology counts remain unchanged;
8. duplicate candidate identities = 0;
9. candidates without raw source artifact = 0;
10. promoted candidate count remains 0 until the promotion gate is explicitly opened.

## Architecture checkpoint before promotion

Candidate staging may proceed on the current migration bridge. **Actual promotion into the professional graph is the checkpoint for freezing the stronger ontology persistence model.** Before production promotion, re-evaluate the generic `ontology_nodes` bridge against the target typed entity registry/subtype tables, many-to-many specialty applicability, separate effective-state projection, and explicit evidence/recheck semantics. Do not deepen the generic bridge merely because candidate staging works.
