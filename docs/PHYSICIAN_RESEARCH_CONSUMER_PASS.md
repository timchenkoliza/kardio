# Physician research consumer pass

Status: implemented on `feature/pharma-content-studio`.

## Feedback incorporated

- research starts immediately instead of asking the physician to approve a search plan first;
- three output modes: article table, brief review, academic foundation beta;
- retrieval-level source filters for Russia / international and guidelines / research;
- exact per-run domain allow/deny controls, collapsed under `Конкретные сайты` so advanced controls do not add default chrome;
- technical execution details collapsed under `Как искали и что было доступно`;
- separate checkability summary (`Проверяемость`) based on evidence statuses, explicitly not a score of study quality or clinical truth;
- article-search output as a compact source table;
- restrained licensed medical illustrations on at most the first two relevant result cards; illustrations are never evidence and always carry a credit link;
- sources split into `Использованы в сводке` and `Найдены дополнительно — не использованы напрямую в сводке`;
- citation templates for ГОСТ / APA / MLA using only metadata actually present in the result;
- bibliography ordering by appearance or alphabetically;
- downloadable Markdown, Word-compatible RTF and LaTeX, with or without bibliography;
- responsive mode cards, filters, report controls and result table;
- duplicate pre-search guidance and explanatory pills removed.

## Retrieval semantics

Region, content type and exact-domain policy are applied before catalog retrieval. PubMed is skipped when the physician chooses only Russian sources, only guidelines, excludes the NCBI/PubMed domain, or supplies an allow-list that does not include PubMed. Domain deny rules override allow rules.

The current exact-domain control is intentionally a host policy, not a claim that PubMed can filter by arbitrary publisher website. Journal-level filtering remains tied to the existing trusted-source preferences.

## Citation / export honesty

Citation formatting is metadata-bound. Missing author, issue, volume or page metadata is not invented, so the output is a structured citation template rather than a guarantee that every incomplete record is fully compliant with a university-specific bibliography rule.

`Word · RTF` is an actual downloadable RTF file that opens in Word. Markdown and LaTeX are plain-text exports. The product does not generate PDF in this flow.

The current brief synthesis directly uses up to four source-grounded findings. Those are the only records labelled `Использованы в сводке`; everything else is shown as additional retrieval, not falsely described as read or cited.

## Deliberately not simulated

The three research modes currently change result presentation, not search depth. A deeper academic search mode and reliable ETA should be implemented only after runtime telemetry exists.

The product still uses metadata / available extracts and does not claim to have read full article text when the connector did not retrieve it.

## Next slices from interviews

1. comparison tables generated from verified structured evidence;
2. background long-running research with completion state and email notification;
3. deeper academic writing mode after full-text retrieval and provenance are strong enough;
4. presentation builder for teaching workflows;
5. benchmark study against IQDOC, Elicit, Consensus and Perplexity using the same physician questions.
