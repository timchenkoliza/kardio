# Event reference transport grouping gate

Status: **ACTIVE DETERMINISTIC STAGING GATE**  
Date: 2026-10-18

## Why this gate exists

Gate 10 inspected the 277 observed `scardio.ru/events/...` reference candidates and found 15 deterministic collision groups covering 30 candidates. The collisions were transport-level variants only:

- `http` vs `https`;
- missing vs present trailing slash.

The same inspection also showed that URL paths encode several different world-object shapes (event occurrence pages, registration/broadcast subpages, and recurring series/projects). Therefore transport de-duplication must be separated from ProfessionalEvent identity resolution.

Flow:

`event_reference_candidates -> transport normalization -> event_reference_transport_groups -> later page/series/occurrence resolution`

## What is grouped

`scardio_transport_v1` normalizes only source differences already demonstrated to be non-identifying:

- host becomes `scardio.ru` (`www.scardio.ru` is equivalent);
- scheme becomes `https`;
- event path gets a canonical trailing slash;
- URL fragment is removed.

Query parameters are preserved. We have not demonstrated that they are non-identifying.

## What is not claimed

An `event_reference_transport_group` is not:

- a ProfessionalEvent;
- an EventSeries;
- an EventOccurrence;
- a registration page role;
- a broadcast surface;
- a canonical title/date/location/person assertion.

It is only a deterministic equivalence class of observed source URLs.

All original `event_reference_candidates` remain intact and each is mapped to exactly one transport group. Provenance is not deleted or rewritten.

## Expected real-data shape from Gate 10

Current Cardiology sample before persistence:

- observed URL-reference candidates: `277`;
- transport-normalized structural keys: `262`;
- collision groups: `15`;
- candidates in collision groups: `30`;
- observed parent/child URL matches: `26`.

These counts are empirical expectations for the current snapshot, not hard-coded product invariants.

## Acceptance

The gate passes when:

1. migration creates only `event_reference_transport_groups` and `event_reference_transport_members`;
2. first sync maps every existing event-reference candidate to exactly one transport group;
3. current sample produces 262 current transport groups from 277 candidates;
4. second sync is idempotent (`insertedGroups = 0`, `insertedMembers = 0`, `movedMembers = 0`);
5. query-bearing references remain distinct;
6. no original event-reference candidate or mention is deleted;
7. `ontologyWrites = 0`;
8. `db:verify` remains green and ontology counts stay unchanged.

Only after this transport identity is stable do we classify reference roles and resolve higher-level `EventSeries`, `EventOccurrence`, and event-page surfaces.
