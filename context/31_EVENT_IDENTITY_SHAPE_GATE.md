# Event identity shape inspection gate

Status: **ACTIVE READ-ONLY IDENTITY GATE**  
Date: 2026-10-18

## Why this gate exists

The event mention context inspection showed complete source coverage for all observed event references, but also revealed an important identity problem: a `scardio.ru/events/...` URL is not automatically a canonical `ProfessionalEvent`.

Observed examples include:

- event-like pages such as `/events/forum_molodyh_kardiologov/forum_molodyh_kardiologov_2025/`;
- child pages such as `/registraciya/` or `/tvstudiya` beneath an event path;
- reusable project/series pages such as `/events/cikly_vebinarov/kardioring/`, referenced across multiple occurrences.

Therefore the next step is to inspect URL identity shape before adding title/date/location enrichment or ontology promotion.

## Flow

`event_reference_candidates -> URL structure + mention history -> identity-shape report -> resolution policy`

This gate is read-only. It does not mutate resolution staging or ontology data.

## Source-grounded structural observations

Allowed observations:

- path depth under `/events/`;
- root and leaf path segments;
- year tokens explicitly present in path segments;
- presence of query parameters;
- whether a structural parent URL is itself an observed event reference;
- mention count and distinct-post count;
- approximate elapsed span between first and last source mentions.

The elapsed span is used only diagnostically. Source-local timestamps remain source-local and no timezone is invented.

## Diagnostic structural key

For measurement only, the inspector computes a structural key that normalizes two transport-level differences already observed in source data:

- `http` -> `https`;
- missing trailing slash -> one trailing slash.

The query string is preserved. This diagnostic key is not yet written back and is not a canonical event identifier.

## Explicitly forbidden

Do not infer or persist:

- that every `/events/...` URL is a distinct event;
- that a child URL is necessarily a child entity rather than a page/surface;
- that a long-lived URL is necessarily an `EventSeries`;
- canonical title/date/location from URL slugs;
- speaker/person identity;
- organizer identity;
- ontology nodes or relations;
- product eligibility;
- Oncology data from Cardiology records.

## Acceptance

The gate passes when:

1. all currently observed event references are structurally inspected;
2. current URL collisions under scheme/trailing-slash normalization are measured;
3. structural parent matches and path-depth distribution are measured;
4. long-lived references are surfaced by mention-span diagnostics;
5. bounded collision/parent-child/long-span examples are reported;
6. `ontologyWrites = 0` and `stagingWrites = 0`;
7. `db:verify` remains green and ontology counts are unchanged.

Only after this gate do we change event identity resolution or introduce Event/Series/Page subtype staging.
