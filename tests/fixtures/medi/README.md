# MEDI-like structural fixtures

Synthetic pages that reproduce the **structure** of medi.ru pages as observed
on 2026-10-21 (selectors, schema.org `itemprop`s, `#cr_*` ids, heading
layout). The wording is short and written for tests; it is not a copy of
MEDI content, and no MEDI page is stored in the repository.

Live behaviour is exercised separately by `LIVE_SOURCES=1 npx vitest run tests/live`.

- `robots.txt` — the robots rules recorded in the adapter's usage policy.
- `inn-empagliflozin.html` — `/analogi-mnn/empagliflozin/` listing.
- `instruction-dzhardins.html` — `/instrukciya/dzhardins_6916/` instruction.
- `filter-kardiologiya.html` — `/filters/doc_type/manuals/kardiologiya/` catalogue.
- `guideline-hsn-v1.html` / `guideline-hsn-v2.html` — one guideline in two
  versions; v2 changes only section 3.1.11 (used by the incremental test).
- `guideline-hsn-v3.html` — v1 with only section 1.1 (definition) reworded: a change no HFpEF scenario depends on.
- `instruction-layout-changed.html` — a redesigned page the extractor must reject.
- `inn-empagliflozin-leaflet-first.html` + `instruction-patient-leaflet.html` — an INN listing whose first product publishes only the EAEU patient leaflet («Листок-вкладыш – информация для пациента»), as observed live for semaglutide on 2026-10-21.
