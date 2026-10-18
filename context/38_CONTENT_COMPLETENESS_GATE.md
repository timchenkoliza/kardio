# Content Completeness Gate

Status: **ACTIVE — Stage 1: Sources + Reference**

## Goal

Every primary navigation destination must provide real professional value from source-grounded data, or a correct user-owned cold start. The product must not expose an empty destination merely because the ingestion pipeline is incomplete.

This gate does **not** relax ontology or trust boundaries in order to make the UI look full.

## Non-negotiable boundaries

- External resources observed in source research are navigation aids, not canonical ontology promotion.
- `source_observations` / research registry rows are not clinical endorsement.
- A curated external link must not increment canonical ontology counts.
- Oncology is never populated by relabeling cardiology objects.
- Event reference candidates and mentions remain staging until reviewed and explicitly promoted; they do not make the Events destination complete.
- No patient data is introduced by completeness work.
- Imaging accepts only anonymized or educational local files in the alpha shell; no patient record is uploaded to the server.
- Unknown media rights remain ineligible for product media placement.

## Stage 1 — Sources

The Sources destination combines two explicitly separated layers:

1. canonical `Source` records returned by the catalog repository;
2. curated external resources whose provenance is either `source_research` or `user_provided`.

Curated resources carry:

- source-registry ID where known;
- specialty applicability;
- language;
- product surfaces where the link is useful;
- provenance class.

Deduplication is by normalized canonical URL or source name. A curated resource that already exists as a canonical source is not rendered as a second source card.

Acceptance:

- canonical cardiology source count remains unchanged by curated resources;
- curated resources can enrich navigation without becoming ontology nodes;
- no cardiology-only curated source appears in oncology.

## Stage 1 — Reference

Reference is a working destination rather than an empty state. It is composed from:

### Native product tools

- cardiology calculators route (`CHA₂DS₂-VA`, `HAS-BLED`);
- visualization route (3D anatomy + local imaging shell).

### External reference resources

- Vidal;
- Drugs.com Drug Interaction Checker;
- Medscape Drug Interaction Checker;
- Boris Bikbov calculator reference where applicable;
- Inobitec DICOM Viewer reference.

These links remain external resources. Rendering them in Reference does not imply clinical endorsement or canonical promotion.

## Stage 2 — Education

Education is considered complete only when the product surface can show at least one of:

- canonical video / educational material;
- a source-grounded education platform explicitly mapped to the specialty.

For cardiology, 1Med.TV is currently observed in source research and may be shown as an external education entry. It remains a research observation unless separately promoted through the canonical pipeline.

## Stage 3 — Events

Events are stricter than Sources/Reference.

Readiness requires at least one canonical content object with `kind = event`.

The current event resolution staging (`event_reference_candidates`, mentions and transport groups) does **not** satisfy this gate by itself. No prose inference and no automatic staging-to-canonical promotion are allowed.

## Read model

`lib/ui/content-completeness.ts` exposes a deterministic completeness snapshot per specialty. It reports, per destination:

- readiness;
- canonical object count;
- curated external object count;
- explicit basis for the decision.

The read model is presentation/QA logic. It performs no writes.

## Database impact

None.

No migration is required for this stage. Existing canonical invariants must remain unchanged.

## Verification

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run db:verify
```

Expected:

- all code checks green;
- content-completeness tests green;
- canonical DB counts unchanged;
- oncology fallback remains zero;
- event references promoted before review remains zero.

## Next gate

After Content Completeness is green, implement **GEN UI composition preferences** as reversible user presentation state:

- pin block;
- show less / downrank;
- hide block;
- hide topic;
- hide source;
- restore from Hidden.

GEN UI preferences must never delete or mutate canonical ontology/catalog objects.
