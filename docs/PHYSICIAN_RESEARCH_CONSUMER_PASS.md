# Physician research consumer pass

Status: implemented on `feature/pharma-content-studio`.

## Feedback incorporated

- research starts immediately instead of asking the physician to approve a search plan first;
- three output modes: article table, brief review, academic foundation beta;
- `Академическая основа · beta` runs as a background job so the physician can leave the page and return later;
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
- evidence comparison matrix for up to four supported / partially supported findings;
- PubMed evidence-text retrieval: PMC full text when available, otherwise PubMed abstract;
- structured Population / Intervention / Comparator / Endpoint / Effect extraction from explicit source sentences;
- deterministic study normalization for N, age, population, inclusion criteria, intervention, dose, treatment duration, comparator, primary endpoint, follow-up, effect measure, point estimate, 95% CI and p-value;
- responsive desktop matrix + mobile comparison cards;
- duplicate pre-search guidance and explanatory pills removed.

## Retrieval semantics

Region, content type and exact-domain policy are applied before catalog retrieval. PubMed is skipped when the physician chooses only Russian sources, only guidelines, excludes the NCBI/PubMed domain, or supplies an allow-list that does not include PubMed. Domain deny rules override allow rules.

The current exact-domain control is intentionally a host policy, not a claim that PubMed can filter by arbitrary publisher website. Journal-level filtering remains tied to the existing trusted-source preferences.

## Citation / export honesty

Citation formatting is metadata-bound. Missing author, issue, volume or page metadata is not invented, so the output is a structured citation template rather than a guarantee that every incomplete record is fully compliant with a university-specific bibliography rule.

`Word · RTF` is an actual downloadable RTF file that opens in Word. Markdown and LaTeX are plain-text exports. The product does not generate PDF in this flow.

The current brief synthesis directly uses up to four findings with `SUPPORTED` evidence. Only those records are labelled `Использованы в сводке`; partially supported, unknown and other retrieved records remain in `Найдены дополнительно`. In article-table mode every visible row is the output itself and therefore belongs to the directly used set.

## Structured clinical evidence

For the highest-ranked PubMed findings the Research pipeline makes an additional text-access pass after the normal search:

1. fetch the PubMed XML record and its abstract;
2. if the record contains a PMCID, request the corresponding PubMed Central full text;
3. prefer PMC full text when it is actually returned; otherwise retain the abstract as the only evidence text;
4. retain up to several explicit source sentences for Population / Intervention / Comparator / Endpoint / Effect so nearby values such as N, age, dose or follow-up are not lost;
5. persist the extracted text, section labels, access type and extraction confidence on the result;
6. run deterministic normalization over those source-bound fragments;
7. show normalized study fields in the comparison table only when the source text contains an explicit match.

No PICOE or normalized study value is inferred from the article title, citation metadata, journal name or another article. Missing fields remain empty. The first version uses deterministic extraction rather than an LLM so provenance is auditable.

`Full text PMC` means that XML body text was actually retrieved from PubMed Central. `Abstract` means only the PubMed abstract was available during the run. These labels describe text access, not study quality.

The extraction currently targets up to three PubMed records for synchronous brief research and up to four for `Академическая основа · beta` to keep latency and NCBI request volume bounded. `Найти статьи` remains metadata-first and does not run the text-enrichment pass.

## Study normalization honesty

Normalization is a parsing layer over already retrieved evidence text, not a new medical inference layer. Each normalized value stores the exact supporting text, the source PICOE field and extraction confidence.

Examples of allowed normalization:

- `We enrolled 1,248 participants` → `N=1248`;
- `mean age was 67 years` → `67 years (mean)`;
- `5 mg twice daily` → dose `5 mg twice daily`;
- `median follow-up was 18 months` → follow-up `18 months (median)`;
- `hazard ratio 0.72; 95% CI 0.58 to 0.89; p=0.003` → measure `HR`, estimate `0.72`, CI `0.58–0.89`, p-value `p = 0.003`.

The parser does not convert HR 0.72 into “28% risk reduction”, does not infer an unstated dose, does not reconstruct inclusion criteria from a title and does not treat extraction confidence as probability that the clinical claim is true.

## Evidence comparison honesty

The comparison block appears only when at least two findings have `SUPPORTED` or `PARTIALLY_SUPPORTED` evidence. Metadata rows remain available for comparable findings; normalized clinical rows appear only when source-bound structured text exists. Rows with no explicit value are omitted globally or shown as empty for the corresponding study.

## Background research jobs

The background slice separates browser navigation from execution state:

1. the request creates a persisted `ResearchJob` in the existing anonymous-session JSON state;
2. the route returns immediately with `202 Accepted`;
3. Next.js `after()` continues the existing Research executor after the response;
4. the job records queued / running / completed / partial / failed / blocked independently from the final `AgentRun`;
5. on completion the job stores the final `runId`, so the normal evidence, export and comparison UI opens without duplicating result storage;
6. the workspace polls job state and raises an in-product notification when an active job becomes terminal.

No email delivery is simulated. External email should be connected only after a real email connector exists.

This is not yet a durable distributed queue. Execution is still bounded by the platform function lifetime. With `DATABASE_URL`, job state survives page navigation and process replacement, but an execution interrupted by a deployment/runtime termination cannot resume from the middle; stale active jobs are marked failed and can be rerun. Without a database, background job state uses the same in-process fallback philosophy as other local beta state and does not survive a dev-server restart.

## Deliberately not simulated

The three presentation modes still do not imply three independent search engines. Academic beta adds background execution and attempts structured evidence-text retrieval, but it is not yet a systematic-review engine.

Full text is limited to what PubMed Central returns. The product does not claim to have read publisher-paywalled full text or a PMC article when retrieval failed.

## Next slices from interviews

1. deeper academic synthesis that cites structured and normalized evidence fields paragraph-by-paragraph;
2. study-design classification and richer controlled values only when explicit source text supports them;
3. durable worker/queue execution with retry and resume semantics after the background beta is measured;
4. presentation builder for teaching workflows;
5. benchmark study against IQDOC, Elicit, Consensus and Perplexity using the same physician questions.
