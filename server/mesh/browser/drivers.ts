import { SourceToolError } from "./errors";

/**
 * Execution drivers for browser-capable sources.
 *
 *   playwright  real headless Chromium (JavaScript, interactions)
 *   http        plain HTTP fetch of server-rendered pages (no JavaScript)
 *
 * Both return the rendered HTML; extraction always runs on the same DOM
 * parser in Node, so a recipe behaves identically under either driver and
 * can be tested on fixtures. Swapping a source to an API later replaces the
 * adapter's execution, not the downstream contract.
 */

export type DriverKind = "playwright" | "http";

export interface PageSnapshot {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  html: string;
  fetchedAt: string;
  driver: DriverKind;
  durationMs: number;
}

export interface SemanticTarget {
  /** CSS selector (structure). */
  css?: string;
  /** Visible text the element must contain. */
  text?: RegExp;
  /** Human description for error codes, e.g. «h1 instruction title». */
  describe: string;
}

export type InteractionStep =
  | { op: "fill"; target: SemanticTarget; value: string }
  | { op: "click"; target: SemanticTarget }
  | { op: "waitFor"; target: SemanticTarget };

export interface OpenOptions {
  userAgent: string;
  timeoutMs: number;
}

export interface BrowserDriver {
  readonly kind: DriverKind;
  available(): Promise<{ ok: boolean; reason: string }>;
  open(url: string, options: OpenOptions): Promise<PageSnapshot>;
  /** JavaScript interactions (fill, click). The HTTP driver refuses explicitly. */
  interact(url: string, steps: readonly InteractionStep[], options: OpenOptions): Promise<PageSnapshot>;
}

function isNetworkError(error: unknown): boolean {
  const code = (error as { cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code;
  return typeof code === "string" && /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|UND_ERR_SOCKET|EPIPE/u.test(code);
}

export class HttpDriver implements BrowserDriver {
  readonly kind = "http" as const;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async available() {
    return { ok: true, reason: "HTTP без выполнения JavaScript" };
  }

  async open(url: string, options: OpenOptions): Promise<PageSnapshot> {
    const started = Date.now();
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          headers: { "User-Agent": options.userAgent, Accept: "text/html,application/xhtml+xml", "Accept-Language": "ru-RU,ru;q=0.9" },
          redirect: "follow",
          signal: AbortSignal.timeout(options.timeoutMs),
        });
        const html = await response.text();
        return { requestedUrl: url, finalUrl: response.url || url, status: response.status, html, fetchedAt: new Date().toISOString(), driver: "http", durationMs: Date.now() - started };
      } catch (error) {
        lastError = error;
        if ((error as Error)?.name === "TimeoutError") throw new SourceToolError("timeout", `${options.timeoutMs}ms`, url);
        if (!isNetworkError(error) || attempt === 1) break;
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    throw new SourceToolError("network", lastError instanceof Error ? (lastError.cause as Error | undefined)?.message ?? lastError.message : "fetch failed", url);
  }

  async interact(url: string): Promise<PageSnapshot> {
    throw new SourceToolError("interaction_unsupported", "http driver cannot run page interactions", url);
  }
}

/* Playwright is optional at runtime (devDependency; absent on serverless). */
interface PwPage {
  goto(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<{ status(): number } | null>;
  content(): Promise<string>;
  url(): string;
  locator(selector: string): { first(): { fill(value: string): Promise<void>; click(): Promise<void>; waitFor(options: { timeout: number }): Promise<void> }; filter(options: { hasText: RegExp }): { first(): { fill(value: string): Promise<void>; click(): Promise<void>; waitFor(options: { timeout: number }): Promise<void> } } };
  route(pattern: string, handler: (route: { request(): { resourceType(): string }; abort(): Promise<void>; continue(): Promise<void> }) => Promise<void>): Promise<void>;
  waitForLoadState(state: "domcontentloaded", options: { timeout: number }): Promise<void>;
}
interface PwContext { newPage(): Promise<PwPage>; close(): Promise<void> }
interface PwBrowser { newContext(options: { userAgent: string; locale: string }): Promise<PwContext>; close(): Promise<void>; isConnected(): boolean }
interface PwModule { chromium: { launch(options: Record<string, unknown>): Promise<PwBrowser> } }

export class PlaywrightDriver implements BrowserDriver {
  readonly kind = "playwright" as const;
  private browser: Promise<PwBrowser> | null = null;
  private availability: { ok: boolean; reason: string } | null = null;

  private async launch(): Promise<PwBrowser> {
    if (!this.browser) {
      this.browser = (async () => {
        const specifier = process.env.SOURCE_BROWSER_MODULE ?? "playwright-core";
        const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ specifier)) as PwModule;
        const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
        return mod.chromium.launch({
          headless: true,
          ...(process.env.SOURCE_BROWSER_EXECUTABLE ? { executablePath: process.env.SOURCE_BROWSER_EXECUTABLE } : {}),
          ...(proxy ? { proxy: { server: proxy } } : {}),
        });
      })();
      this.browser.catch(() => { this.browser = null; });
    }
    const browser = await this.browser;
    if (!browser.isConnected()) { this.browser = null; return this.launch(); }
    return browser;
  }

  async available() {
    if (this.availability) return this.availability;
    try {
      await this.launch();
      this.availability = { ok: true, reason: "Chromium (Playwright)" };
    } catch (error) {
      this.availability = { ok: false, reason: `браузер недоступен: ${error instanceof Error ? error.message.split("\n")[0].slice(0, 120) : "ошибка запуска"}` };
    }
    return this.availability;
  }

  private async withPage<T>(url: string, options: OpenOptions, run: (page: PwPage) => Promise<T>): Promise<T> {
    let browser: PwBrowser;
    try { browser = await this.launch(); } catch (error) {
      throw new SourceToolError("driver_unavailable", error instanceof Error ? error.message.split("\n")[0].slice(0, 120) : "launch failed", url);
    }
    const context = await browser.newContext({ userAgent: options.userAgent, locale: "ru-RU" });
    try {
      const page = await context.newPage();
      // Text only: images, fonts and media are never needed for extraction.
      await page.route("**/*", async route => {
        const type = route.request().resourceType();
        if (type === "image" || type === "font" || type === "media" || type === "stylesheet") await route.abort();
        else await route.continue();
      });
      return await run(page);
    } catch (error) {
      if (error instanceof SourceToolError) throw error;
      const message = error instanceof Error ? error.message.split("\n")[0] : "browser error";
      if (/timeout/iu.test(message)) throw new SourceToolError("timeout", `${options.timeoutMs}ms`, url);
      throw new SourceToolError("network", message.slice(0, 160), url);
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  async open(url: string, options: OpenOptions): Promise<PageSnapshot> {
    const started = Date.now();
    return this.withPage(url, options, async page => {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
      return { requestedUrl: url, finalUrl: page.url(), status: response?.status() ?? 0, html: await page.content(), fetchedAt: new Date().toISOString(), driver: "playwright", durationMs: Date.now() - started };
    });
  }

  async interact(url: string, steps: readonly InteractionStep[], options: OpenOptions): Promise<PageSnapshot> {
    const started = Date.now();
    return this.withPage(url, options, async page => {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
      for (const step of steps) {
        const base = page.locator(step.target.css ?? "body");
        const element = step.target.text ? base.filter({ hasText: step.target.text }).first() : base.first();
        try {
          if (step.op === "fill") await element.fill(step.value);
          else if (step.op === "click") { await element.click(); await page.waitForLoadState("domcontentloaded", { timeout: options.timeoutMs }); }
          else await element.waitFor({ timeout: options.timeoutMs });
        } catch {
          throw new SourceToolError("layout_changed", `interaction target missing: ${step.target.describe}`, url);
        }
      }
      return { requestedUrl: url, finalUrl: page.url(), status: response?.status() ?? 0, html: await page.content(), fetchedAt: new Date().toISOString(), driver: "playwright", durationMs: Date.now() - started };
    });
  }
}

const globals = globalThis as unknown as { kardioBrowserDriver?: Promise<BrowserDriver> };

/**
 * Driver selection: SOURCE_BROWSER=playwright|http|off (default auto: a real
 * browser when one can start, otherwise HTTP). The choice is reported in
 * every invocation so a LIMITED execution is never presented as LIVE.
 */
export function selectDriver(): Promise<BrowserDriver | null> {
  const mode = (process.env.SOURCE_BROWSER ?? "auto").toLowerCase();
  if (mode === "off") return Promise.resolve(null);
  if (mode === "http") return Promise.resolve(new HttpDriver());
  if (!globals.kardioBrowserDriver) {
    globals.kardioBrowserDriver = (async () => {
      const browser = new PlaywrightDriver();
      const availability = await browser.available();
      if (availability.ok) return browser;
      if (mode === "playwright") return browser;
      return new HttpDriver();
    })();
  }
  return globals.kardioBrowserDriver;
}
