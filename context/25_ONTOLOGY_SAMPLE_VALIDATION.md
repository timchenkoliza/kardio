# KARDIO — Ontology Sample Validation v1

Status: manual pre-parser validation.  
Date: 2026-10-18

Purpose: validate the ontology against real exported channel content **before** writing a Telegram parser. This document is not a content-approval record and does not grant media/content rights.

## Source inspected

Cardiology export: Telegram Desktop HTML export for the official Russian Society of Cardiology channel (`Российское кардиологическое общество`). The raw archive remains external; the examples below are ontology mappings, not copied product content.

## Cardiology samples

### Sample 1 — channel introduction / navigation post (`message4`)

Observed characteristics:

- publisher/distribution source: Russian Society of Cardiology channel;
- explains channel purpose and internal content hashtags;
- no primary medical claim requiring canonical promotion.

Ontology mapping:

- future `distribution_post` candidate;
- `published_by → source`;
- `applies_to_specialty → cardiology`;
- hashtags/taxonomy remain distribution metadata or candidate topic links;
- **must not become clinical authority**.

Result: ontology supports this without inventing a clinical knowledge object.

### Sample 2 — antiarrhythmic-therapy lecture (`message7`)

Observed characteristics:

- Telegram distribution post;
- YouTube lecture link;
- named expert/speaker;
- professional topic: antiarrhythmic therapy / rhythm disorders;
- webpage preview media.

Ontology mapping:

- `distribution_post` → `references` → `educational_material` candidate;
- `educational_material` → `features_person` / `authored_by` → `person` candidate, subject to identity resolution;
- `educational_material` → `concerns` → `topic`;
- `distribution_post` → `contains_asset` → `media_asset` candidate;
- source/media rights remain independent.

Result: validates separation of distribution, knowledge object, person, topic and media.

### Sample 3 — online hypertension seminar (`message8`)

Observed characteristics:

- dated professional online seminar;
- named speaker;
- organizer/source link;
- registration/action link;
- attached photo;
- time-sensitive event state.

Ontology mapping:

- `distribution_post` → `references` → `professional_event` candidate;
- `professional_event` → `features_person` → `person` candidate;
- `professional_event` → `concerns` → `topic`;
- `professional_event` → `organized_by` → `organization/source` after source resolution;
- photo → `media_asset`, with rights state independent from semantic match;
- event lifecycle can later emit `event_announced`, `event_updated`, `event_started`, `event_finished`.

Result: validates explicit event entity/state rather than treating an event as an ordinary article card.

### Sample 4 — AL amyloidosis clinical teaser (`message9`)

Observed characteristics:

- short clinical educational teaser;
- disease/concept mention;
- attached image;
- insufficient evidence in the post alone to promote the text to canonical clinical knowledge.

Ontology mapping:

- `distribution_post` candidate;
- `concerns → topic` immediately;
- reserved `condition` / `clinical_concept` becomes appropriate only after controlled entity resolution;
- attached image → `media_asset` candidate;
- post itself remains distribution/editorial evidence rather than clinical authority.

Result: confirms the need to keep `condition`/`clinical_concept` available as reserved ontology types rather than coercing every disease mention into a canonical condition node during parsing.

### Sample 5 — source/site availability incident (`message10`)

Observed characteristics:

- operational notice that the society website is under attack/unreliable;
- this is not professional knowledge content;
- it changes source availability/trust context temporarily.

Ontology mapping:

- `distribution_post` candidate as evidence;
- references/resolves to the relevant `source`;
- may produce a `source_unavailable` domain event;
- may produce an availability state fact for the source with short TTL/reverification;
- must not appear as a clinical knowledge object merely because it is a post.

Result: validates the state/event layer. This is an important “living product” behavior analogous to availability/state changes in mature commerce systems.

## Findings after Cardiology sample

The ontology successfully represents five materially different professional-world situations without introducing screen-specific content models.

No new core node type is required before parser implementation.

The sample confirms that `distribution_post` should move from reserved vocabulary to implemented ingestion vocabulary when the parser phase begins. `condition` and `clinical_concept` remain reserved until entity resolution supplies evidence; plain text mentions must not auto-promote them.

## Oncology validation status

Required gate: at least 5 real Oncology posts across mixed formats before parser automation is accepted for Oncology.

Current status on 2026-10-18: **BLOCKED_BY_UPLOAD**.

The registered Drive folders:

- `oncology_channel_01`
- `oncology_channel_02`

currently contain no visible files in the connected Drive view. Do not synthesize Oncology examples to satisfy this gate.

When upload completes, repeat the same manual validation against real Oncology posts before promoting the Telegram parser to Oncology ingestion.

## Parser gate

Cardiology: ontology shape is sufficient for parser prototyping.  
Oncology: do not claim parser validation until real exported posts are present and mapped manually.
