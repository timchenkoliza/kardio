# GEN UI block taxonomy

Status: ACTIVE PRODUCT CONTRACT

## Goal

GEN UI composes professional surfaces from a bounded set of product blocks. It does not generate arbitrary UI, mutate the canonical ontology, infer patient context, or optimize for engagement.

The flow is:

`canonical world -> eligibility/ranking -> typed blocks -> user UI preferences -> rendered surface`

User preferences are reversible presentation state only.

## Block kinds

- `hero_knowledge` — one primary professional object.
- `knowledge_shelf` — bounded fallback shelf for knowledge objects that do not yet have a stronger typed presentation.
- `evidence_shelf` — studies, articles, and evidence-oriented knowledge objects.
- `clinical_shelf` — clinical materials and source-grounded case-oriented objects; never a patient profile.
- `guideline_shelf` — current recommendations and versions.
- `tool_shelf` — calculators, tools, and quick professional actions.
- `reference_shelf` — reference and instrument objects.
- `event_rail` — source-grounded professional events; placement does not imply that an event is upcoming.
- `source_shelf` — routes to professional sources.
- `learning_shelf` — lectures, courses, and educational material.
- `saved_shelf` — user-owned saved or pinned objects.
- `collection_shelf` — user-created collections.
- `topic_cluster` — explicitly selected themes/interests and deterministic topic routes.
- `context_prompt` — compact next-step/search entry.
- `assistant_entry` — contextual assistant entry; never the primary product surface.
- `update_strip` — recent changes / continue-work objects.

Each kind has a default layout region (`primary`, `rail`, or `full`). Region is a composition hint, not ontology data.

## Explore composition policy

The default Explore surface is deterministic and type-aware. It is not a single ranked list rendered through one universal card.

Lead selection order:

1. active clinical object with product-eligible media;
2. active article with product-eligible media;
3. active clinical object;
4. active article;
5. active guideline;
6. next active object in deterministic catalog order.

If no active (`current` / `review`) object exists, the same fallback logic is applied to the ordered catalog. Archived and superseded objects remain accessible, but they do not outrank an active lead.

After the lead is selected, objects are partitioned without duplication into:

- `clinical_shelf`;
- `guideline_shelf`;
- `evidence_shelf`;
- `learning_shelf`;
- `event_rail`;
- bounded `knowledge_shelf` overflow for remaining explicit catalog types.

This is product composition, not engagement optimization. No click-through, dwell-time, patient data, or inferred patient context enters the ordering.

## Media rule

A clinical image is not replaced by generated semantic-looking artwork. The catalog repository exposes `asset.url` only after its rights / verification gate. Typed clinical, guideline, event, and hero presentations therefore use real eligible media when it exists and otherwise remain text-first.

Decorative fallback art is permitted only for clearly non-clinical editorial surfaces such as generic article/evidence or learning cards. Decorative art carries no clinical meaning.

## User controls

Supported preferences:

- `pinned` — move the block earlier in its composition order.
- `less` — move the block later.
- `hidden` — remove the block from the rendered surface.
- `default` — clear the preference.

Preferences are scoped by `specialty + shell + blockId`. Hidden blocks remain recoverable in Settings.

## Shells

### Explore

GEN UI controls the body below the stable page heading/tabs. Current typed composition may contain:

- `hero_knowledge`;
- `clinical_shelf`;
- `guideline_shelf`;
- `evidence_shelf`;
- `learning_shelf`;
- `event_rail`;
- `topic_cluster`;
- `context_prompt`;
- `knowledge_shelf` only as bounded overflow.

Search results and explicit filtered catalog views remain deterministic result surfaces rather than GEN UI compositions.

### Practice

Current typed composition:

- `tool_shelf`;
- `guideline_shelf`;
- `saved_shelf`;
- `reference_shelf` when explicit catalog tools exist.

Guidelines and personal state are independent blocks; hiding one does not hide the other.

### Workspace

Workspace contains only user-owned state plus a contextual assistant entry. Current typed composition:

- `assistant_entry`;
- `context_prompt` for cold start;
- `saved_shelf`;
- `collection_shelf`;
- `update_strip`;
- `topic_cluster`.

The assistant is collapsed behind a contextual entry by default. It may use user-supplied professional interests and safe aggregate text, but it must not become a patient-data surface.

## Non-goals

- no arbitrary LLM-generated component tree;
- no hidden engagement optimizer;
- no automatic ontology promotion from UI state;
- no synthetic oncology content;
- no patient node, patient routing, EHR/MIS state, or patient inference;
- no removal of canonical objects when a user hides a UI block.
