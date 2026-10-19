# Agent-first migration report

## CURRENT → TARGET

| Current | Target |
| --- | --- |
| Feed and category navigation | Job-first command center |
| Sources/tools as destinations | Shared capabilities behind agents |
| Consilium as active surface | Hidden from active product direction |
| Imaging as active surface | Hidden from active product direction |
| Generic content browsing | Agent result generated from an explicit physician job |
| Drug directory-style surface | Drug change detection |
| Events destination | Events agent with discovery → relevance → next available action |
| Saved content only | My Materials: notes, links, text files, saved agent results |

## Implemented in this branch

- dedicated agent-first route for `/[specialty]`
- three-item primary navigation
- universal delegation composer
- seven explicit user-facing agents
- internal intent router/supervisor
- catalog-backed research/guideline/drug/event/learning execution
- provenance and verification status on results
- real timestamp-based `newSinceLastSeen`
- explicit LIVE/UNAVAILABLE connector states
- visual agent configuration persisted locally
- local My Materials prototype
- responsive layout contract for 390 / 768 / 1440
- legacy Consilium/imaging query parameters no longer route to those surfaces
- new agent-first unit and Playwright acceptance tests

## Not production-complete

- agent preferences and materials need authenticated server persistence
- PDF parsing/indexing is not connected
- PubMed live search is not connected
- calendar and email are not connected
- event registration is an external source link, not autonomous registration
- notification scheduler is not implemented
- full ontology-backed agent result persistence is not implemented

These are represented as unavailable rather than silently mocked.
