import { readFileSync } from "node:fs";
import path from "node:path";
import type { BrowserContext } from "@playwright/test";
import { DS_README, DS_TOKENS, TOOL_DIR } from "../config";
import { loadDesignSystem } from "../tokens";

export const ORIGIN = "http://fixture.test";
export const YEAR = 2026;
export const ds = loadDesignSystem(DS_TOKENS, DS_README);

/** `:root` with every DS token at its DS value: fixtures never drift from tokens.json. */
const DS_ROOT = `:root {\n${[...ds.cssTokens].map(([name, value]) => `  ${name}: ${value};`).join("\n")}\n}`;

export function fixture(name: string): string {
  return readFileSync(path.join(TOOL_DIR, "__fixtures__", `${name}.html`), "utf8").replace("/*DS_ROOT*/", DS_ROOT);
}

/** Serves route → HTML (or an HTTP status) on http://fixture.test through Playwright request routing. */
export function serve(pages: Record<string, string | number>) {
  return async (context: BrowserContext) => {
    await context.route(`${ORIGIN}/**`, async route => {
      const { pathname } = new URL(route.request().url());
      const page = pages[pathname];
      if (typeof page === "number") return route.fulfill({ status: page, contentType: "text/html", body: "<!doctype html><title>error</title>" });
      if (page === undefined) return route.fulfill({ status: 404, contentType: "text/html", body: "<!doctype html><title>404</title>" });
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: page });
    });
  };
}
