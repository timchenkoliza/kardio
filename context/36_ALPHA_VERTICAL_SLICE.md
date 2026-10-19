# Cardiology alpha vertical slice

Status: **IMPLEMENTATION ACTIVE**  
Date: 2026-10-18

## Scope

This slice turns the existing data/runtime foundation into the first usable physician product path. It is intentionally narrower than the full portal.

Primary path:

`/cardiology -> browse/search -> open material -> inspect source/currentness -> related material -> save -> /cardiology?view=saved`

## Implemented product behavior

- root redirects to Cardiology;
- real content is read from PostgreSQL through the existing typed catalog repository;
- feed ordering is deterministic and inspectable;
- search uses title, summary, source, author, topics and tags, with no engagement model;
- tabs/filter surfaces never fabricate missing content;
- source directory uses canonical source records;
- content detail exposes source, publication metadata, currentness and source URL when present;
- related material uses explicit topic/source/kind overlap only;
- save state persists in the existing anonymous HttpOnly session model;
- query and opened-item history stay in private session state;
- analytics records bounded event names and never receives raw query text;
- Oncology renders an explicit data-gap state and never receives Cardiology fallback content.

## Visual target

The active visual layer follows `21_VISUAL_RESET_V2.md`:

- light consumer-product canvas;
- restrained periwinkle accent;
- strong editorial typography;
- heterogeneous feed rhythm;
- source-first metadata;
- image-free content treated as intentional;
- no generic doctor imagery;
- no medical SaaS dashboard grammar.

## Alpha non-goals

Not required for this vertical slice:

- canonical promotion of Telegram/event staging;
- inferred event dates from Gate 13;
- full Toolbelt implementation;
- full Workspace collections UX;
- calculators without approved formulas;
- VMP data without an approved source;
- Oncology content without its own canonical import;
- partner pages without source-grounded partner content.

## Acceptance run

Before visual review:

```bash
npm run typecheck
npm run lint
npm test
npm run db:verify
npm run build
```

Then run locally and inspect at minimum:

- 390 px;
- 768 px;
- 1440 px.

Required manual path:

1. open `/cardiology`;
2. inspect real source/title/currentness rendering;
3. search for a known term;
4. open a material;
5. follow primary source when available;
6. save the material;
7. open `Мои материалы` and verify persistence;
8. switch to Oncology and confirm no Cardiology content leaks into it;
9. return to Cardiology and confirm saved state remains available.

No alpha-complete claim is valid until the runtime path and responsive layouts have been visually inspected.
