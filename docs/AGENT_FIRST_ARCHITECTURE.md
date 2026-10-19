# Kardio agent-first workspace architecture

## Product hierarchy

`USER sees JOBS → AGENTS own GOALS → TOOLS own CAPABILITIES → CONNECTORS own ACCESS`

This migration replaces the active information architecture, not the evidence/data foundation.

## Active user surfaces

- `Главное` — physician command center and delegation composer
- `Мои агенты` — visual preferences, not giant prompts
- `Мои материалы` — personal links, notes, text files and saved agent outputs

Legacy Consilium and medical-image surfaces remain in source code during the safe migration, but `/[specialty]` no longer routes to them.

## Agent catalog

- What changed / `whats-new`
- Guideline changes / `guideline-change`
- Drug changes / `drug-change`
- Deep research / `research`
- Events / `events`
- Learning / `learning`
- My materials / `materials`

## Supervisor

`routeTask()` classifies the physician request into `research | prepare | simulate | act`, respects an explicitly selected agent, and returns an internal plan.

The user-facing UI does not expose tool-call internals.

## Current capability status

| Capability | Mode | Notes |
| --- | --- | --- |
| Golden Set catalog retrieval | LIVE | Reuses current Cardiology catalog and source objects |
| Provenance projection | LIVE | Canonical/source URL, publisher, dates and verification status |
| Rule-based fact/risk gate | MOCK | Conservative rules-only gate; not a substitute for evidence validation |
| PubMed live connector | UNAVAILABLE | Never silently replaced with fake results |
| Calendar write | UNAVAILABLE | Events can only link to the external source |
| Email send | UNAVAILABLE | No fake send |
| Personal material server index | UNAVAILABLE | Preview uses browser-local text/link persistence |

## Evidence

Every result item exposes source ID/name/type, canonical/source URL when available, publication date when known, retrieval timestamp and verification status: `SUPPORTED | PARTIALLY_SUPPORTED | UNSUPPORTED | UNKNOWN`.

## Since last visit

No hard-coded update counters. `newSinceLastSeen` is computed from actual `updatedAt`, `publicationDate` or `lastCheckedAt` against the previous agent run timestamp.

## Safety boundary

Kardio has no patient/EHR/MIS context. The product performs professional knowledge jobs from physician intent. External actions require confirmation; this preview does not execute calendar/email/registration actions.
