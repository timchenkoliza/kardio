# Distribution signal inspection gate

Status: **ACTIVE PRE-RESOLUTION GATE**  
Date: 2026-10-18

## Purpose

Before creating entity-resolution tables or promoting Telegram-derived objects into the professional ontology, inspect the source-grounded structure already present in `distribution_post_candidates`.

This gate is intentionally read-only.

Flow:

`distribution_post_candidates -> explicit source signals -> aggregate inspection -> resolution schema design`

No ontology nodes, ontology edges, evidence records, state facts or candidate-review state may be written by this inspection step.

## Allowed signals in this gate

### Explicit format taxonomy

Only exact channel hashtags declared by the source are mapped:

- `#рко_вебинар` -> `webinar`
- `#рко_лекция` -> `lecture`
- `#рко_мероприятия` -> `event`
- `#рко_новости` -> `news`
- `#рко_полезныйматериал` -> `useful_material`

A word such as "вебинар" or "лекция" in body text does **not** classify a post in this gate.

### External references

HTTP(S) link hosts may be normalized for aggregate analysis. A `scardio.ru/events/...` URL is counted as an explicit event-page reference because the source URL itself encodes that page role. This does not yet create or resolve a `professional_event` entity.

### Media

Existing parser media kinds may be counted. Rights, semantic match and product eligibility remain unresolved.

## Explicitly forbidden in this gate

Do not infer or persist:

- person identity from a displayed name;
- clinical concept identity from free text;
- guideline/research-study identity from mention text;
- event identity from prose alone;
- authority, trust or clinical truth;
- media rights;
- ontology relations;
- product eligibility;
- Oncology fallback from Cardiology data.

## Acceptance

The gate passes when:

1. unit tests confirm that only explicit source taxonomy drives format labels;
2. the real 3,515 Cardiology distribution candidates can be inspected read-only;
3. output shows explicit-format coverage, overlap, major external domains, explicit scardio event-page references and media-kind distribution;
4. `ontologyWrites = 0` and `stagingWrites = 0`;
5. `db:verify` remains green with unchanged ontology counts after inspection.

The resulting empirical distribution is then used to define the bounded entity-resolution staging model instead of inventing a schema from assumptions.
