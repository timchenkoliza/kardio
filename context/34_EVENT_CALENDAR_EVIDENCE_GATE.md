# Event calendar evidence inspection gate

Status: **ACTIVE READ-ONLY IDENTITY GATE**  
Date: 2026-10-18

## Purpose

Gate 12 showed that the bounded structural role model resolves only part of the 262 transport groups:

- page-surface-like references can often be identified structurally;
- year-bearing references can look occurrence-like;
- a very small number of long-lived references look series-like;
- most references remain unresolved.

The next question is whether source-grounded Telegram context contains explicit calendar evidence that can improve identity resolution without inventing event dates.

Flow:

`transport group -> present mentions -> exact link label/body text -> literal calendar expressions -> coverage/conflict report`

This gate is read-only. It does not persist extracted calendar signals and it does not create event identities.

## Allowed extraction

The extractor may report only literal source text patterns:

- Russian day/month expressions such as `19 апреля`;
- explicit ranges such as `19–20 апреля 2024`;
- numeric dates such as `13.09.2023`;
- clock times such as `18:00 (мск)`;
- standalone years;
- relative words such as `сегодня`, `завтра`, `послезавтра`.

Relative words are never resolved against the post timestamp in this gate.

A literal date match is only calendar evidence. It is **not** automatically treated as:

- event start/end date;
- registration deadline;
- publication date;
- programme date;
- canonical occurrence identity.

## Why this matters

Multiple distinct day/month signatures attached to the same transport group can be evidence that a URL represents a recurring series/project rather than one occurrence. Conversely, a stable single signature across repeated mentions can support later occurrence resolution, but still requires an explicit policy before persistence.

This gate also reports observed parent-child references that were not classified as page surfaces, so the page-surface vocabulary can be audited before any role is persisted.

## Explicitly forbidden

Do not:

- convert relative dates to absolute dates;
- infer missing years from publication timestamps;
- choose one matched date as the canonical event date;
- merge or split event identities;
- create organizer/person/topic identities;
- create ontology nodes/edges;
- change review state;
- promote any candidate;
- create Oncology data from Cardiology evidence.

## Acceptance

The gate passes when:

1. all current transport groups with present mentions are inspected;
2. date-expression coverage is reported for body text and link labels;
3. groups with multiple distinct day/month signatures are visible;
4. unresolved groups are split diagnostically into no-date / single-date / multi-date evidence buckets;
5. observed parent-child references missed by the page-surface vocabulary are surfaced;
6. `ontologyWrites = 0` and `stagingWrites = 0`;
7. `db:verify` remains green with unchanged ontology counts.

Only after this inspection should calendar evidence participate in a persisted event-identity candidate model.
