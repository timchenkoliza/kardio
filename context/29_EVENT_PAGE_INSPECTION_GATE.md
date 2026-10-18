# Event page inspection gate

Status: **ACTIVE READ-ONLY ENRICHMENT GATE**  
Date: 2026-10-18

## Purpose

Before enriching or promoting `event_reference_candidates`, inspect a bounded sample of the actual `scardio.ru/events/...` pages and measure which machine-readable signals are really present.

Flow:

`event_reference_candidates -> guarded HTTP GET -> source-grounded page metadata -> structural coverage report`

This gate is read-only. It must not change event candidate review state, ontology nodes, ontology edges, evidence records or state facts.

## Allowed extraction

Only fields explicitly present in the fetched page may be reported:

- HTTP status, redirect count and final URL;
- response content type;
- HTML `<title>`;
- canonical link;
- OpenGraph title/description;
- JSON-LD `@type` values;
- JSON-LD event fields such as `name`, `startDate`, `endDate`, `url` and `location.name` when present.

Malformed JSON-LD is ignored rather than repaired.

## Network boundary

The inspector starts only from URLs already resolved as explicit `scardio.ru/events/...` references. Redirects are followed manually and only while they remain on `scardio.ru` or `www.scardio.ru`; cross-host redirects are blocked and reported.

Default inspection is intentionally bounded to 10 candidates and may be increased only up to 25 with `EVENT_PAGE_INSPECT_LIMIT`.

## Explicitly forbidden

Do not infer or persist:

- event identity from page prose beyond the already-resolved URL identity;
- speaker/person identity from names in text;
- clinical concept identity;
- organizer authority or clinical truth;
- media rights;
- event currentness or availability from publication age alone;
- ontology relations;
- product eligibility;
- Oncology fallback.

## Acceptance

The gate passes when:

1. unit tests show that prose alone does not create structured event fields;
2. malformed JSON-LD is ignored;
3. a bounded real sample can be fetched or its HTTP/network failure states are explicitly reported;
4. output measures title/canonical/JSON-LD/structured-event coverage;
5. `ontologyWrites = 0` and `stagingWrites = 0`;
6. `db:verify` remains green and ontology counts are unchanged.

The observed structure determines the next enrichment schema. We do not add title/date/location/speaker columns before seeing what the source pages actually expose reliably.
