# Event semantic role inspection gate

Status: **ACTIVE READ-ONLY IDENTITY GATE**  
Date: 2026-10-18

## Purpose

Gate 11 established transport-normalized equivalence classes for event-reference URLs. Those 262 transport groups are still not canonical event identities.

This gate tests a bounded diagnostic role model before any event-entity schema is introduced:

`transport group -> structural/source signals -> diagnostic role -> review of coverage/ambiguity`

Diagnostic roles:

- `page_surface_like` — exact observed subpage vocabulary such as registration, TV studio, video stream, programme/rules/NMO pages;
- `occurrence_like` — non-surface references carrying an explicit year token in the path;
- `series_like` — non-year references reused across at least 180 days of source-local mention history;
- `unresolved` — insufficient evidence.

These labels are inspection output only. They are not persisted and they do not approve ontology promotion.

## Why this gate exists

Real source data already disproved the assumption that every `/events/...` URL represents one `ProfessionalEvent`:

- transport duplicates exist (`http`/`https`, trailing slash);
- child pages such as `/registraciya/`, `/tvstudiya/`, and `/videotranslyaciya` can sit under an observed parent event page;
- year-bearing paths often look like annual occurrences;
- long-lived references such as webinar projects can represent a series/project reused for many individual broadcasts.

The ontology must therefore separate reference/page identity from event occurrence/series identity.

## Allowed evidence

Only source-grounded or previously measured structure is used:

- transport-normalized reference URL;
- path depth, root/leaf segment and year tokens;
- whether the structural parent URL is also an observed transport group;
- count of original URL members;
- mention/post counts;
- source-local mention span.

A source-local span is used only as a duration diagnostic. It is not converted into an event instant.

## Explicitly forbidden

Do not persist or infer:

- canonical event title;
- exact event date/time;
- organizer or speaker identity;
- clinical concepts;
- event currentness or availability;
- ontology nodes/edges;
- product eligibility;
- Oncology fallback.

## Acceptance

The gate passes when:

1. all current transport groups are inspected;
2. role counts and bounded samples are reported;
3. root families with multiple year-bearing groups are measured;
4. page-surface-like references with observed parent groups are visible;
5. ambiguous references remain `unresolved` rather than being forced into an event type;
6. `ontologyWrites = 0` and `stagingWrites = 0`;
7. `db:verify` remains green with unchanged ontology counts.

Only after this inspection should we design persisted identity tables for event series, event occurrences, and reference/page surfaces.
