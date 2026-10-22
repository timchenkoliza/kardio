import type { RobotsSnapshot } from "@/lib/mesh/sources";
import { absoluteUrl, findAll, parseDocument, type DomDocument } from "./dom";
import type { BrowserDriver, InteractionStep, PageSnapshot, SemanticTarget } from "./drivers";
import { SourceToolError } from "./errors";
import { RobotsGuard } from "./robots";

/**
 * BrowserSourceTool — the generic contract for professional websites:
 *
 *   open → search → interact → extract → normalize → provenance
 *
 * A site adapter supplies only data: entry URLs, an interaction recipe,
 * semantic targets, a normalizer and its output schema. The tool enforces
 * the site's robots rules and allowed paths, a per-host politeness interval,
 * a page budget and a cache, and records every page it opened. Nothing in
 * here knows about any particular site.
 */

export interface SiteProfile {
  id: string;
  origin: string;
  robots: RobotsSnapshot;
  /** Path prefixes recipes are allowed to open (in addition to robots). */
  allowedPathPrefixes: readonly string[];
  userAgent: string;
  minIntervalMs: number;
  cacheTtlSeconds: number;
  timeoutMs: number;
  maxPagesPerInvocation: number;
}

export interface OpenedPage {
  snapshot: PageSnapshot;
  document: DomDocument;
  cached: boolean;
}

export interface Extractor<T> {
  id: string;
  version: string;
  /** Throws SourceToolError("layout_changed") when a required target is missing. */
  run(document: DomDocument, page: PageSnapshot): T;
}

export interface VisitRecord {
  url: string;
  status: number;
  driver: PageSnapshot["driver"];
  fetchedAt: string;
  cached: boolean;
}

export interface ToolProvenance {
  site: string;
  driver: PageSnapshot["driver"] | null;
  visits: VisitRecord[];
  robotsCheckedAt: string;
  userAgent: string;
}

interface SharedState {
  nextSlot: Map<string, number>;
  cache: Map<string, { snapshot: PageSnapshot; expires: number }>;
  robots: Map<string, RobotsGuard>;
}

const globals = globalThis as unknown as { kardioBrowserTool?: SharedState };
const shared: SharedState = globals.kardioBrowserTool ?? { nextSlot: new Map(), cache: new Map(), robots: new Map() };
globals.kardioBrowserTool = shared;

/** Test hook: forget cached pages and politeness slots. */
export function resetBrowserToolState(): void {
  shared.nextSlot.clear();
  shared.cache.clear();
  shared.robots.clear();
}

async function politeSlot(origin: string, intervalMs: number): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, shared.nextSlot.get(origin) ?? 0);
  shared.nextSlot.set(origin, slot + intervalMs);
  if (slot > now) await new Promise(resolve => setTimeout(resolve, slot - now));
}

export class BrowserSourceTool {
  private readonly visits: VisitRecord[] = [];
  private pages = 0;
  private readonly robots: RobotsGuard;

  private readonly fallbackDriver: BrowserDriver | null;
  /** Epoch ms after which no new page is opened (the step's hard deadline). */
  private readonly deadlineAt: number | null;

  constructor(
    private readonly site: SiteProfile,
    private readonly driver: BrowserDriver,
    options: { robots?: RobotsGuard; fallbackDriver?: BrowserDriver | null; deadlineAt?: number | null } = {},
  ) {
    // A second execution mode for the same recipe (e.g. HTTP when the browser path hits a gateway error).
    this.fallbackDriver = options.fallbackDriver ?? null;
    this.deadlineAt = options.deadlineAt ?? null;
    const existing = options.robots ?? shared.robots.get(site.origin);
    this.robots = existing ?? new RobotsGuard(site.robots, async url => {
      try {
        const page = await driver.open(url, { userAgent: site.userAgent, timeoutMs: Math.min(site.timeoutMs, 5_000) });
        return page.status === 200 ? page.html.replace(/<[^>]+>/gu, "") : null;
      } catch { return null; }
    });
    if (!options.robots) shared.robots.set(site.origin, this.robots);
  }

  /** Per-page timeout: the site's own limit, never past the step's hard deadline. */
  private pageTimeout(url: string): number {
    if (this.deadlineAt === null) return this.site.timeoutMs;
    const remaining = this.deadlineAt - Date.now();
    if (remaining < 200) throw new SourceToolError("timeout", "step_deadline", url);
    return Math.min(this.site.timeoutMs, remaining);
  }

  /** open(): fetch one allowed page (cache → robots → politeness → driver). `fresh` re-reads the source (re-verification). */
  async open(url: string, options: { fresh?: boolean } = {}): Promise<OpenedPage> {
    const absolute = absoluteUrl(url, this.site.origin);
    const parsed = new URL(absolute);
    if (parsed.origin !== new URL(this.site.origin).origin) throw new SourceToolError("outside_allowed_paths", parsed.origin, absolute);
    if (!this.site.allowedPathPrefixes.some(prefix => parsed.pathname.startsWith(prefix))) throw new SourceToolError("outside_allowed_paths", parsed.pathname, absolute);
    const robots = await this.robots.check(absolute);
    if (!robots.allowed) throw new SourceToolError("robots_disallow", robots.rule ?? parsed.pathname, absolute);

    const cached = options.fresh ? undefined : shared.cache.get(absolute);
    if (cached && cached.expires > Date.now()) {
      this.visits.push({ url: absolute, status: cached.snapshot.status, driver: cached.snapshot.driver, fetchedAt: cached.snapshot.fetchedAt, cached: true });
      return { snapshot: cached.snapshot, document: parseDocument(cached.snapshot.html), cached: true };
    }
    if (this.pages >= this.site.maxPagesPerInvocation) throw new SourceToolError("page_budget_exceeded", String(this.site.maxPagesPerInvocation), absolute);
    this.pages += 1;
    await politeSlot(this.site.origin, this.site.minIntervalMs);
    let snapshot: PageSnapshot;
    try {
      snapshot = await this.driver.open(absolute, { userAgent: this.site.userAgent, timeoutMs: this.pageTimeout(absolute) });
      if (this.fallbackDriver && (snapshot.status >= 502 && snapshot.status <= 504)) throw new SourceToolError("http_error", String(snapshot.status), absolute);
    } catch (error) {
      const retryable = error instanceof SourceToolError && (error.code === "network" || error.code === "http_error" || error.code === "timeout");
      if (!this.fallbackDriver || !retryable) throw error;
      await politeSlot(this.site.origin, this.site.minIntervalMs);
      snapshot = await this.fallbackDriver.open(absolute, { userAgent: this.site.userAgent, timeoutMs: this.pageTimeout(absolute) });
    }
    this.visits.push({ url: absolute, status: snapshot.status, driver: snapshot.driver, fetchedAt: snapshot.fetchedAt, cached: false });
    if (snapshot.status === 404 || snapshot.status === 410) throw new SourceToolError("not_found", String(snapshot.status), absolute);
    if (snapshot.status === 0) throw new SourceToolError("network", "no response", absolute);
    if (snapshot.status >= 400) throw new SourceToolError("http_error", String(snapshot.status), absolute);
    shared.cache.set(absolute, { snapshot, expires: Date.now() + this.site.cacheTtlSeconds * 1000 });
    if (shared.cache.size > 400) shared.cache.delete(shared.cache.keys().next().value!);
    return { snapshot, document: parseDocument(snapshot.html), cached: false };
  }

  /** search(): open the entry page a recipe derives from the query (sites whose own search is off-limits use deterministic entry URLs). */
  async search<Q>(entry: (query: Q) => string | null, query: Q): Promise<OpenedPage | null> {
    const url = entry(query);
    return url ? this.open(url) : null;
  }

  /** interact(): follow a link chosen by semantic target, or run JavaScript steps (browser driver only). */
  async interact(page: OpenedPage, action: { follow: SemanticTarget; attribute?: string } | { steps: readonly InteractionStep[] }): Promise<OpenedPage> {
    if ("follow" in action) {
      const link = findAll(page.document, action.follow).find(element => element.getAttribute(action.attribute ?? "href"));
      if (!link) throw new SourceToolError("layout_changed", `follow target missing: ${action.follow.describe}`, page.snapshot.finalUrl);
      return this.open(absoluteUrl(link.getAttribute(action.attribute ?? "href")!, page.snapshot.finalUrl));
    }
    const robots = await this.robots.check(page.snapshot.finalUrl);
    if (!robots.allowed) throw new SourceToolError("robots_disallow", robots.rule ?? "", page.snapshot.finalUrl);
    if (this.pages >= this.site.maxPagesPerInvocation) throw new SourceToolError("page_budget_exceeded", String(this.site.maxPagesPerInvocation), page.snapshot.finalUrl);
    this.pages += 1;
    await politeSlot(this.site.origin, this.site.minIntervalMs);
    const snapshot = await this.driver.interact(page.snapshot.finalUrl, action.steps, { userAgent: this.site.userAgent, timeoutMs: this.site.timeoutMs });
    this.visits.push({ url: snapshot.finalUrl, status: snapshot.status, driver: snapshot.driver, fetchedAt: snapshot.fetchedAt, cached: false });
    return { snapshot, document: parseDocument(snapshot.html), cached: false };
  }

  extract<T>(page: OpenedPage, extractor: Extractor<T>): T {
    return extractor.run(page.document, page.snapshot);
  }

  normalize<T, R>(raw: T, normalizer: (raw: T, provenance: ToolProvenance) => R): R {
    return normalizer(raw, this.provenance());
  }

  provenance(): ToolProvenance {
    return {
      site: this.site.id,
      driver: this.visits.find(visit => !visit.cached)?.driver ?? this.visits[0]?.driver ?? null,
      visits: [...this.visits],
      robotsCheckedAt: this.site.robots.checkedAt,
      userAgent: this.site.userAgent,
    };
  }
}
