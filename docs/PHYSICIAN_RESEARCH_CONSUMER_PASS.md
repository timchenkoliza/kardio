# Physician research consumer pass

Status: implemented as a moderate UX pass on `feature/pharma-content-studio`.

## Feedback incorporated now

- start research immediately instead of asking the physician to review a search plan first;
- offer three output modes: article table, brief review, academic foundation beta;
- apply source filters for Russia / international and guidelines / research before retrieval;
- keep exact source preferences in existing source settings rather than duplicating them in the composer;
- collapse technical execution details under `Как искали и что было доступно`;
- show a separate checkability summary (`Проверяемость`) based on evidence statuses, explicitly not as a score of study quality or clinical truth;
- render article-search output as a compact source table;
- add restrained licensed medical illustrations to at most the first two relevant result cards per result list; illustrations are never evidence and always carry a credit link;
- keep layout responsive for the research mode cards, filters, trust summary and result table;
- remove duplicate pre-search guidance and explanatory pills that repeated what the interface already communicated.

## Retrieval policy now

The research composer uses a dedicated scoped Research API. Selected filters are bound to the run and applied before tools execute.

- `Только РФ` filters the canonical catalog to Russian provenance and deliberately skips PubMed.
- `Только международные` excludes Russian catalog provenance and keeps international catalog sources plus PubMed.
- `Только клинрекомендации` searches guideline/clinical catalog material and skips PubMed research retrieval.
- `Только исследования` searches article material and PubMed.
- the combined mode searches both groups and explicitly reserves room for matching guideline/clinical material when it exists.

Existing trusted/excluded source preferences are still enforced inside the filtered scope.

## Deliberately not simulated

The three presentation modes currently change the result presentation, not search depth. A deeper academic search mode and reliable ETA should be implemented only after runtime telemetry exists.

Exact arbitrary-domain include/exclude is not claimed yet. Current source settings operate on the product's known source catalogue.

## Deferred from interviews

Separate future slices:

1. explicit arbitrary-domain include/exclude and publication-category filters beyond the current known-source catalogue;
2. citation/export: GOST, APA/MLA, order by appearance/alphabet, Markdown/Word/LaTeX and with/without bibliography;
3. research report visualizations and comparison tables generated from verified structured evidence;
4. background long-running research with completion state and email notification;
5. academic writing mode after deep retrieval and provenance are strong enough;
6. presentation builder for teaching workflows;
7. benchmark study against IQDOC, Elicit, Consensus and Perplexity using the same physician questions.
