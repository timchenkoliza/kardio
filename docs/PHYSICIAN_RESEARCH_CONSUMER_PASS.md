# Physician research consumer pass

Status: implemented as a moderate UX pass on `feature/pharma-content-studio`.

## Feedback incorporated now

- start research immediately instead of asking the physician to review a search plan first;
- offer three output modes: article table, brief review, academic foundation beta;
- expose lightweight source filters for Russia / international and guidelines / research;
- keep exact site include/exclude in existing source settings rather than duplicating it in the composer;
- collapse technical execution details under `Как искали и что было доступно`;
- show a separate checkability summary (`Проверяемость`) based on evidence statuses, explicitly not as a score of study quality or clinical truth;
- render article-search output as a compact source table;
- add restrained licensed medical illustrations to at most the first two relevant result cards per result list; illustrations are never evidence and always carry a credit link;
- keep layout responsive for the research mode cards, filters, trust summary and result table.

## Deliberately not simulated

The three research modes currently change the result presentation, not search depth. The UI says this explicitly. A deeper academic search mode and reliable ETA should be implemented only after runtime telemetry exists.

The Russia / international and content-type filters currently filter the displayed result set. They do not yet alter connector queries. Exact website include/exclude already belongs to source settings and remains there.

## Deferred from interviews

Separate future slices:

1. retrieval-level source policy: region, explicit include/exclude domains, publication categories and guideline-required search;
2. citation/export: GOST, APA/MLA, order by appearance/alphabet, Markdown/Word/LaTeX and with/without bibliography;
3. research report visualizations and comparison tables generated from verified structured evidence;
4. background long-running research with completion state and email notification;
5. academic writing mode after deep retrieval and provenance are strong enough;
6. presentation builder for teaching workflows;
7. benchmark study against IQDOC, Elicit, Consensus and Perplexity using the same physician questions.
