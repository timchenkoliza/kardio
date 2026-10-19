import { asc, eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { eventReferenceCandidates } from "@/db/resolution-schema";
import { parseEventPageSignals } from "@/server/ingestion/event-page-inspection";

const limit = Math.max(1, Math.min(25, Number(process.env.EVENT_PAGE_INSPECT_LIMIT ?? 10) || 10));
const timeoutMs = Math.max(1_000, Math.min(30_000, Number(process.env.EVENT_PAGE_FETCH_TIMEOUT_MS ?? 10_000) || 10_000));

// Exact allowlist only. The live scardio.ru site currently redirects many historical
// event pages to its archive host old.scardio.ru. We allow that observed archive host
// explicitly rather than widening the boundary to arbitrary *.scardio.ru subdomains.
const allowedHosts = new Set(["scardio.ru", "www.scardio.ru", "old.scardio.ru"]);

interface FetchResult {
  status: number | null;
  finalUrl: string;
  redirects: number;
  contentType: string | null;
  html: string | null;
  error: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

function allowed(url: URL): boolean {
  return (url.protocol === "https:" || url.protocol === "http:") && allowedHosts.has(url.hostname.toLocaleLowerCase("en-US"));
}

function errorDetails(error: unknown): { error: string; errorCode: string | null; errorMessage: string | null } {
  if (!(error instanceof Error)) {
    return { error: "fetch_failed", errorCode: null, errorMessage: String(error) };
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const record = cause as Record<string, unknown>;
    return {
      error: error.name,
      errorCode: typeof record.code === "string" ? record.code : null,
      errorMessage: typeof record.message === "string" ? record.message : error.message,
    };
  }

  return { error: error.name, errorCode: null, errorMessage: error.message };
}

async function fetchPage(startUrl: string): Promise<FetchResult> {
  let current = new URL(startUrl);
  if (!allowed(current)) {
    return {
      status: null,
      finalUrl: startUrl,
      redirects: 0,
      contentType: null,
      html: null,
      error: "blocked_source_url",
      errorCode: null,
      errorMessage: null,
    };
  }

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    try {
      const response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "User-Agent": "kardio-ontology-inspector/1.0",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          return {
            status: response.status,
            finalUrl: current.toString(),
            redirects,
            contentType: response.headers.get("content-type"),
            html: null,
            error: "redirect_without_location",
            errorCode: null,
            errorMessage: null,
          };
        }
        const next = new URL(location, current);
        if (!allowed(next)) {
          return {
            status: response.status,
            finalUrl: next.toString(),
            redirects: redirects + 1,
            contentType: response.headers.get("content-type"),
            html: null,
            error: "blocked_cross_host_redirect",
            errorCode: null,
            errorMessage: null,
          };
        }
        current = next;
        continue;
      }

      const contentType = response.headers.get("content-type");
      const isHtml = contentType?.toLocaleLowerCase("en-US").includes("text/html") ?? false;
      const html = isHtml ? await response.text() : null;
      return {
        status: response.status,
        finalUrl: current.toString(),
        redirects,
        contentType,
        html,
        error: isHtml ? null : "non_html_response",
        errorCode: null,
        errorMessage: null,
      };
    } catch (error) {
      return {
        status: null,
        finalUrl: current.toString(),
        redirects,
        contentType: null,
        html: null,
        ...errorDetails(error),
      };
    }
  }

  return {
    status: null,
    finalUrl: current.toString(),
    redirects: 4,
    contentType: null,
    html: null,
    error: "too_many_redirects",
    errorCode: null,
    errorMessage: null,
  };
}

try {
  const candidates = await db
    .select({ id: eventReferenceCandidates.id, url: eventReferenceCandidates.normalizedUrl })
    .from(eventReferenceCandidates)
    .where(eq(eventReferenceCandidates.reviewState, "observed"))
    .orderBy(asc(eventReferenceCandidates.normalizedUrl))
    .limit(limit);

  const samples: Array<Record<string, unknown>> = [];
  let httpOk = 0;
  let http4xx = 0;
  let http5xx = 0;
  let networkErrors = 0;
  let redirects = 0;
  let titlesPresent = 0;
  let canonicalPresent = 0;
  let jsonLdPages = 0;
  let structuredEventPages = 0;

  for (const candidate of candidates) {
    const fetched = await fetchPage(candidate.url);
    if (fetched.status !== null && fetched.status >= 200 && fetched.status < 300) httpOk += 1;
    else if (fetched.status !== null && fetched.status >= 400 && fetched.status < 500) http4xx += 1;
    else if (fetched.status !== null && fetched.status >= 500) http5xx += 1;
    else if (fetched.status === null) networkErrors += 1;
    redirects += fetched.redirects;

    const signals = fetched.html ? parseEventPageSignals(fetched.html, candidate.url) : null;
    if (signals?.htmlTitle) titlesPresent += 1;
    if (signals?.canonicalHref) canonicalPresent += 1;
    if (signals && signals.jsonLdTypes.length > 0) jsonLdPages += 1;
    if (signals && signals.structuredEvents.length > 0) structuredEventPages += 1;

    samples.push({
      candidateId: candidate.id,
      sourceUrl: candidate.url,
      status: fetched.status,
      finalUrl: fetched.finalUrl,
      redirects: fetched.redirects,
      contentType: fetched.contentType,
      error: fetched.error,
      errorCode: fetched.errorCode,
      errorMessage: fetched.errorMessage,
      htmlTitle: signals?.htmlTitle ?? null,
      canonicalHref: signals?.canonicalHref ?? null,
      ogTitle: signals?.ogTitle ?? null,
      jsonLdTypes: signals?.jsonLdTypes ?? [],
      structuredEvents: signals?.structuredEvents ?? [],
    });
  }

  console.log(JSON.stringify({
    mode: "read_only_event_page_inspection",
    allowedHosts: [...allowedHosts],
    availableObservedCandidates: await db.$count(eventReferenceCandidates, eq(eventReferenceCandidates.reviewState, "observed")),
    requestedLimit: limit,
    inspected: candidates.length,
    httpOk,
    http4xx,
    http5xx,
    networkErrors,
    redirects,
    titlesPresent,
    canonicalPresent,
    jsonLdPages,
    structuredEventPages,
    samples,
    ontologyWrites: 0,
    stagingWrites: 0,
  }, null, 2));
} finally {
  await pool.end();
}
