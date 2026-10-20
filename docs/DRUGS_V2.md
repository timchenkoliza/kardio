# Drugs v2 — source-aware drug change intelligence

Status: implemented on `feature/pharma-content-studio`.

## Product job

The Drugs agent monitors changes around medicines in the physician's topics. It is not a drug directory and does not prescribe treatment.

The result model separates five different things that must not be collapsed into one statement:

1. a public report that a regulatory event happened;
2. the official regulatory status in the relevant jurisdiction;
3. a clinical-guideline change involving a medicine or class;
4. a new study / evidence signal;
5. a practical interpretation of what the product can safely conclude from the available source.

## Hard rule for GRLS

`grls` is `UNAVAILABLE` and `dataOrigin=none`.

Until a real official-source integration exists, the agent MUST NOT use a media report, company announcement, curated snapshot, cached page or a navigation link to claim that a Russian registration, withdrawal, restriction or label/instruction change is officially confirmed.

For such Russian regulatory records:

- `drugAssessment.officialVerification = needs_grls`;
- `drugAssessment.grlsRequired = true`;
- an explicit `UNKNOWN` evidence item is added for the unavailable GRLS verification step;
- the public report itself may remain `PARTIALLY_SUPPORTED` if its quoted text supports the report;
- the result title is source-attributed (`По данным источника: ...`) when a secondary report would otherwise read like an official fact;
- the UI reason explicitly says that the official Russian status is not confirmed because GRLS is unavailable;
- the result keeps a manual `Проверить в ГРЛС` navigation action, but that link is never treated as evidence.

This distinction is intentional: “the source reports that registration occurred” and “the product verified the official Russian registration” are two different claims.

## Other jurisdictions

A secondary report about FDA/EMA or another regulator is marked `needs_primary_source`. It can support the existence of a public report, but it is not upgraded to primary-regulator confirmation.

A future record can use `confirmed_primary` only when the result is actually grounded in the relevant primary regulatory source.

## Non-regulatory evidence

Guideline changes use `guideline_context` and do not imply a label or registration change.

New studies use `pubmed_metadata` or `secondary_study_report`. A new study is an evidence signal and does not automatically change an official label, registration status or clinical recommendation.

## Assessment fields

Each drug-change result can persist:

- `basis` — primary regulator / secondary regulatory report / guideline context / PubMed metadata / secondary study report / announcement;
- `officialVerification` — confirmed primary / needs GRLS / needs primary source / not applicable;
- `sourceBasisLabel`;
- `officialVerificationLabel`;
- `verificationTarget`;
- `grlsRequired`;
- `practiceImpact`.

`practiceImpact` is a bounded interpretation of the workflow consequence, not a patient-specific treatment recommendation.

## Current limitations

The existing regulatory feed is still a curated snapshot, not a live FDA/EMA/GRLS stream. Live PubMed search remains available for important new studies, but bibliographic publication metadata is not treated as a verified clinical conclusion without article text.

The next step after this slice should be live primary-regulator ingestion where technically/legalistically available, without weakening the GRLS hard gate.
