# CURRENT → TARGET app map

## Current main before migration

The production route `/[specialty]` is a legacy multi-surface shell. It exposes feed/catalog views plus drugs, tools, Consilium, reference, imaging, VMP, events and education through query-string routing.

Reusable infrastructure:
- Cardiology Golden Set ingestion and catalog repository
- Source objects, canonical URLs, currentness and provenance fields
- PostgreSQL/Drizzle persistence
- event ingestion/resolution utilities
- user state service
- existing design tokens and responsive primitives
- CI with typecheck, lint, unit, integration, build and Playwright

Legacy active product surfaces to retire from primary IA:
- feed / `Лента`
- standalone source directory
- Consilium
- medical image visualization / interpretation
- standalone tools/reference taxonomy as top-level product destinations

## Target migration

Primary IA:
1. `Главное`
2. `Мои агенты`
3. `Мои материалы`

The physician sees professional jobs. Agent orchestration, search, evidence, fact/risk gates and connectors remain implementation capabilities.

The first safe vertical slice reuses the Golden Set rather than rewriting ingestion:
`physician intent → supervisor → selected agent → catalog retrieval → provenance/verification → result → local save`

External integrations that are not connected remain explicitly `UNAVAILABLE`.
