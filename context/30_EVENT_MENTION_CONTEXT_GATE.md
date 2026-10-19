# Event mention context inspection gate

Status: **ACTIVE READ-ONLY ENRICHMENT GATE**  
Date: 2026-10-18

## Why this gate exists

Historical `scardio.ru/events/...` pages redirect to `old.scardio.ru`, whose TLS certificate is expired. We do not bypass TLS verification and we do not downgrade ingestion trust.

The trusted source context already available in PostgreSQL is therefore the next evidence layer:

`event_reference_candidate -> event_reference_mention -> distribution_post_candidate -> original Telegram text/link label/hashtags/timestamp`

This gate inspects that context without writing any staging or ontology data.

## What is source-grounded here

Allowed observations:

- event reference URL already extracted from the Telegram export;
- Telegram post identity;
- original post timestamp fields;
- exact anchor label attached to the event URL;
- exact post text excerpt;
- exact hashtags;
- mention counts and post counts per event reference.

These values are evidence observations only. A title-looking anchor label is not yet a canonical event title. A date-looking string in post text is not yet an event date.

## What this gate measures

For all currently observed event references:

- how many event candidates have one or more present mentions;
- how many candidates appear in multiple mentions;
- how many distinct distribution posts reference an event candidate;
- coverage of non-empty link labels;
- coverage of hashtags;
- bounded examples for the most frequently referenced event candidates.

The purpose is to decide which fields can be extracted deterministically in Event Enrichment v1 and which require review or a later model-assisted resolver.

## Explicitly forbidden

Do not persist or infer:

- canonical event title from anchor text alone;
- event date/time from prose without an explicit extraction/review policy;
- person or speaker identity;
- organizer identity;
- clinical concepts;
- event currentness or availability;
- media rights;
- ontology relations;
- product eligibility;
- Oncology data from Cardiology records.

## Acceptance

The gate passes when:

1. all 277 observed event candidates can be joined back to source-grounded mention context where available;
2. output reports label/hashtag/mention coverage and bounded samples;
3. `ontologyWrites = 0` and `stagingWrites = 0`;
4. `db:verify` remains green with unchanged ontology counts.

Only after this empirical inspection do we define Event Enrichment v1 fields and promotion rules.
