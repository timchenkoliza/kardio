# Event reference resolution gate

Status: **ACTIVE BOUNDED RESOLUTION STAGING**  
Date: 2026-10-18

## Why this gate exists

The real Cardiology Telegram corpus shows that explicit source hashtags cover only a minority of posts, while explicit event-page links provide a separate high-signal path. Resolution therefore starts from source-grounded identifiers, not free-text classification.

This gate implements only one bounded resolver:

`distribution post external link -> explicit scardio.ru/events/... reference -> event reference candidate`

An event reference candidate is staging data, not a `professional_event` ontology node.

## Accepted resolution basis

Only HTTP(S) URLs whose normalized host is exactly `scardio.ru` and whose path begins with `/events` are accepted.

The resolver:

- preserves the observed page URL as the identity basis after conservative normalization;
- strips URL fragments because they identify an in-page location rather than a separate fetched resource;
- does not infer event identity from body text;
- does not treat `event.scardio.ru`, generic `scardio.ru` pages, hashtags, or words such as “вебинар” as equivalent event identities.

Additional source-specific resolvers may be added only after separate inspection and tests.

## Staging model

### `event_reference_candidates`

One deterministic row per normalized explicit event-page reference. It contains URL identity, resolution basis, review state, timestamps and an optional future promoted ontology node reference.

### `event_reference_mentions`

One observed link occurrence connecting a distribution post/link ordinal to an event reference candidate. Mentions keep source presence history instead of being hard-deleted when an export changes.

## Non-goals

This gate does not:

- fetch or scrape event pages;
- derive event title/date/location/speakers;
- merge different URLs by fuzzy similarity;
- infer person identities;
- infer clinical topics;
- create ontology nodes or edges;
- approve content, authority, rights or product eligibility;
- create Oncology fallback data.

## Acceptance

1. resolver unit tests pass;
2. migration adds only the two resolution-staging tables and their indexes/FKs;
3. the real Cardiology candidate corpus can sync deterministic event references;
4. a second sync is idempotent;
5. missing source mentions are retained as `missing` rather than deleted;
6. `ontologyWrites = 0`;
7. `db:verify` keeps canonical ontology counts unchanged and reports zero staging orphans/duplicates/premature promotion.

Only after this gate is green may event-page enrichment/review be designed. Promotion into the professional ontology remains a later, explicit step.
