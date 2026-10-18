# KARDIO / Yandex Med — App Ontology v1

Status: **AUTHORITATIVE DOMAIN ONTOLOGY FOR FULL-STACK IMPLEMENTATION**  
Date: 2026-10-18

This document defines the professional-world model used by the full-stack application. It does not replace the product boundary in `00_START_HERE.md`, the v3 guardrails, or the visual direction in `21_VISUAL_RESET_V2.md`.

## 1. Product-world principle

The application must model the professional world before it models screens.

The core chain is:

`world ontology → evidence/state/events → graph relations → projections → ingestion adapters → UI`

A card, feed row, search result, Toolbelt item or Workspace item is a **projection** of the same professional entity. The product must not create duplicated domain records merely because an object appears on multiple surfaces.

This is the analogue of a mature commerce/grocery system where Product, Availability, Category, Price, Cart and Delivery state exist independently of the screen rendering them. In KARDIO the first-class objects are professional knowledge, sources, topics, tools, events, people, media and their current states/relationships.

## 2. World graph vs user state

The professional world graph and personal state are separate.

### World graph

Contains professional entities and evidence-backed relations:

- taxonomy;
- knowledge objects;
- sources/organizations/people;
- tools/services;
- events/education/distribution;
- media;
- datasets/external artifacts;
- evidence and state facts.

### User state

Contains explicit user-owned state:

- selected specialty;
- selected working shell;
- saves;
- pins;
- followed topics/sources;
- recent queries/objects;
- collections;
- later user-created workspaces.

User-state rows reference ontology node IDs but are **not** professional-knowledge graph nodes or edges.

## 3. Node vocabulary

The ontology keeps a bounded vocabulary. Types are split into **implemented now** and **reserved**. Reserved types belong to the product vocabulary but must not produce empty tables/components merely for completeness.

### 3.1 Implemented now

| Node type | Purpose |
| --- | --- |
| `specialty` | Explicit professional specialty applicability. v1: cardiology, oncology. |
| `topic` | Stable professional topic/category used for retrieval and relationships. |
| `professional_job` | Explicit physician job such as finding a guideline, tool or reference. |
| `source` | Information/distribution source. Source observation does not equal endorsement. |
| `organization` | Society, journal/publisher, university, company, organizer. |
| `person` | Expert, author or speaker when identity is source-grounded. |
| `guideline` | Guideline/recommendation object. |
| `professional_article` | Editorial/news/professional material that is not proven to be a primary research study. |
| `educational_material` | Lecture, TV studio material, educational video or similar learning object. |
| `professional_event` | Webinar/conference/event object. |
| `professional_service` | Professional service/membership/project capability when present in canonical data. |
| `reference_entry` | Clinical/reference card or structured reference object. |
| `media_asset` | Photo, figure, portrait, video, document cover or event visual. |
| `dataset` | Canonical imported dataset/evaluation corpus identity. |
| `external_artifact` | Raw external file/export, e.g. `messages.html`, JSON export or uploaded PDF. |

### 3.2 Reserved for later evidence-backed use

- `condition`
- `clinical_concept`
- `drug_entity`
- `procedure`
- `diagnostic_method`
- `partner`
- `research_study`
- `review`
- `drug_reference`
- `algorithm`
- `tool`
- `calculator`
- `referral_pathway`
- `course`
- `discussion`
- `distribution_post`

These become implemented only when source-grounded data needs them. In particular, a Telegram post that links to a study is not itself a `research_study`.

## 4. Stable node identity

Canonical imported entities keep source/original IDs where that identity is stable and collision-safe. Generated ontology identities use deterministic namespacing:

`<node_type>:<specialty-or-global>:<namespace>:<original-id>`

Examples:

- `guideline:cardiology:goldenset:cardio-kr-001`
- `source:cardiology:goldenset:rko`
- `topic:cardiology:goldenset:heart-failure`
- `person:cardiology:goldenset:<stable-derived-key>`

Never use random IDs for canonical imported entities. Re-importing the same evidence must produce the same node identities.

## 5. Relation vocabulary and signatures

Relations are first-class, typed and evidence-backed. The write layer must reject relations whose source/target types violate the signature matrix.

| Relation | Allowed source types | Allowed target types |
| --- | --- | --- |
| `applies_to_specialty` | all professional/source/topic/person/org/media nodes | `specialty` |
| `concerns` | knowledge/event/service/reference/educational nodes | `topic`, reserved `condition`, reserved `clinical_concept` |
| `useful_for_job` | knowledge/service/reference/event/educational nodes | `professional_job` |
| `published_by` | guideline/article/educational/event/reference nodes; later distribution/research/review | `source`, `organization` |
| `provided_by` | service/event/educational/reference/article nodes | `organization` |
| `authored_by` | guideline/article/educational/reference; later research/review | `person`, `organization` |
| `organized_by` | `professional_event`; later `course` | `organization`, `source` |
| `references` | article/educational/reference; later distribution/review | any professional knowledge/source node except user state |
| `derived_from` | professional knowledge/media node | professional knowledge node, `external_artifact`, `dataset` |
| `version_of` | versionable professional knowledge node | compatible professional knowledge node |
| `supersedes` | versionable professional knowledge node | compatible professional knowledge node |
| `related_to` | professional-world node | professional-world node |
| `contains_asset` | knowledge/event/service/distribution nodes | `media_asset` |
| `depicts` | `media_asset` | `person`, `organization`, `professional_event`, reserved `clinical_concept`, reserved `condition` |
| `features_person` | knowledge/event/educational/distribution nodes | `person` |
| `dataset_contains` | `dataset` | source/knowledge/topic/job/media nodes |
| `originated_from` | `media_asset`, later `distribution_post` | `external_artifact`, `source` |

`supersedes` is directional: newer → older. A separate `superseded_by` edge is unnecessary because incoming traversal provides the inverse.

A raw `parent_document_id` from the Golden Set must not be over-interpreted. If its semantics are not stronger than “related parent document”, map it to `related_to` with original-field evidence instead of inventing `version_of`.

## 6. Multidimensional state

There is no single `status`.

### Currentness

`unknown | current | review | superseded | archived`

Currentness is evidence-backed. Version relations may support it but never define it automatically.

- `archive != superseded`
- a newer-looking object does not automatically make another object superseded;
- absence of a newer object does not automatically make an object current.

### Editorial state

`raw | candidate | needs_review | approved | rejected`

### Rights state

`unknown | source_reference_only | prototype_only | approved_internal | approved_product | licensed | public_domain | rejected`

### Availability

`unknown | available | temporarily_unavailable | broken | removed`

### Source standing

`observed | identity_verified | editorially_approved | restricted | rejected`

Metadata completeness is never a trust/approval score.

### Semantic media match

`unknown | candidate | strong | exact | rejected`

Semantic match and usage rights are orthogonal. An `exact` image with `unknown` rights remains production-ineligible.

## 7. State facts and history

State is represented as facts with history, not destructive overwrites.

A state fact contains at minimum:

- node ID;
- dimension;
- value;
- evidence reference when applicable;
- `valid_from`;
- optional `valid_until`;
- `recorded_at`.

Derived state may be computed from asserted facts/relations, but derived state must not silently overwrite source assertions.

## 8. EvidenceRecord

Every important derived property, relation or state should be explainable.

Evidence records support targets:

- node;
- node property;
- relation;
- state fact.

Core fields:

- `id`
- target reference
- `evidence_type`
- `source_node_id` where applicable
- `external_url`
- `artifact_ref`
- `captured_at`
- `verified_at`
- `extraction_method`
- `confidence`
- `review_status`
- `rights_status`
- `valid_from`
- `expires_at`
- `notes`

`confidence` is confidence in extraction/matching/classification, never clinical-truth probability.

## 9. TTL and re-verification

TTL never deletes historical evidence or turns a statement into falsehood.

Expiration semantics:

`verified → needs_reverification`

not:

`verified → false`

Typical recheck cadence is policy-specific:

- URL availability: short;
- event details: short;
- source metadata: medium;
- guideline currentness: source-specific;
- model-derived tags/relations: re-evaluate after source change;
- explicit user save: no TTL;
- approved rights: do not silently downgrade without policy/evidence.

## 10. Domain events

Domain events make the system responsive to changes without requiring engagement dark patterns. They are not a requirement to event-source the entire application.

World events:

- `content_discovered`
- `content_ingested`
- `content_reviewed`
- `content_updated`
- `content_superseded`
- `content_archived`
- `source_verified`
- `source_unavailable`
- `event_announced`
- `event_updated`
- `event_started`
- `event_finished`
- `media_discovered`
- `media_matched`
- `media_rights_changed`

User analytics/state events remain outside the professional graph, e.g. search submitted, source opened, save/pin/follow changes, collection changes, specialty/shell changes.

## 11. Cardiology / Oncology specialization

There is one ontology and one platform, not two unrelated products.

Every professional object/source/topic that appears on a specialty surface needs explicit applicability evidence through `applies_to_specialty` or equivalent persisted specialty scope.

Rules:

- Cardiology Golden Set objects map to Cardiology only unless explicit cross-specialty evidence exists.
- Oncology queries/surfaces never fall back to Cardiology.
- Raw oncology channel exports may generate **candidate** nodes/relations only after ingestion and source resolution.
- No raw post becomes canonical Oncology medical knowledge by default.

## 12. Golden Set mapping

The existing Cardiology Golden Set remains immutable migration evidence.

Mapping rules:

- one `dataset` node represents the canonical dataset;
- 18 canonical source records become `source` nodes;
- each canonical content record becomes the closest evidence-safe professional node type;
- `canonical_topic_id`/topic become `topic` nodes and `concerns` edges;
- `clinical_task` becomes/reuses a `professional_job` node and `useful_for_job` edge;
- source relationship becomes `published_by`;
- organization becomes/reuses `organization` and a source-grounded relation;
- author/expert becomes/reuses `person` only when non-null and source-grounded;
- explicit `supersedes_id` creates `supersedes`;
- ambiguous parent relationships are preserved without stronger inference;
- image enrichment becomes `media_asset` + `contains_asset`, with independent rights/editorial/semantic-match state facts;
- every canonical entity links to the dataset with `dataset_contains`;
- raw canonical records remain preserved for traceability/checksum validation;
- the 24-object evaluation slice continues to reference the same canonical identities through the mapping layer.

No mapper may mutate the source Golden Set records.

## 13. Google Drive / channel ingestion contract

Google Drive is a raw source archive. It is not the application database and not a media CDN.

Current archive root:

`1JnLZvA-yab8bkmRrq8juovMS8t4ld6cR`

Known top-level collections include Telegram, journals, events and experts. Telegram currently contains separate Cardiology and Oncology channel export folders.

Future channel ingestion flow:

`Drive folder → ExternalArtifact → parser → DistributionPost candidates → entity/link/media resolution → evidence/review → canonical/projection eligibility`

A Telegram export such as `messages.html` maps first to `external_artifact`. Individual posts later map to reserved `distribution_post` nodes. A post may reference a guideline/study/event/expert and contain a media asset, but the post itself does not become clinical authority.

Media files keep provenance back to their raw artifact/post. Product rendering requires the centralized media eligibility policy and cleared rights.

The app runtime must not depend on Google Drive URLs. A later sync provider may copy/normalize metadata and approved media into application-controlled storage.

## 14. UI projections — “Lavka logic” for the professional world

The ontology exists to support compact, context-sensitive projections rather than duplicated screen models.

### Explore / Navigator

Projection over current/approved/relevant specialty-scoped professional objects, explicit follows and meaningful freshness. It is finite/high-signal rather than an infinite engagement feed.

### Search

`query → intent/concepts → professional nodes → authority/currentness → relationship expansion`

Results may legitimately contain different classes: guideline, source, event, educational object, reference or tool.

### Practice / Toolbelt

Projection over explicit pins, recent/frequent professional objects, tools/references/guidelines and user-owned shortcuts.

### Knowledge Workspace

Projection over saved objects, collections, followed topics/sources and explicit user organization.

### Object detail

One object can project source/organization, currentness, evidence, version relations, topics/jobs, people, media and a small explainable related graph.

A/B/C shells remain different working projections over the same object identities and user state.

## 15. Migration bridge

Do not delete `ContentObject` immediately.

Migration path:

`existing ContentObject / Golden Set normalization → ontology mapper/adapter → ontology repository/projections`

Existing application paths may continue using the old normalized shape during transition. New ontology persistence/query code must be additive. Legacy assumptions are removed only after equivalent projection behavior is covered and tested.

## 16. Acceptance for ontology v1

The ontology foundation is acceptable when:

1. node/relation/state/evidence/event vocabularies are typed in code;
2. relation signatures reject invalid edges;
3. 54/54 canonical objects and 18/18 canonical sources map deterministically;
4. 24/24 evaluation IDs remain resolvable;
5. source input checksum is unchanged by mapping;
6. supersession/currentness semantics are preserved without inference inflation;
7. media rights and semantic relevance are independent;
8. Cardiology/Oncology isolation is explicit;
9. user state remains outside the professional graph;
10. future Drive/Telegram ingestion can target the ontology without changing its core shape.
