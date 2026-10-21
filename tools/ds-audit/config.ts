import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Viewport } from "./types";

export const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(TOOL_DIR, "../..");
export const DS_TOKENS = path.join(REPO_ROOT, "design-system/tokens.json");
export const DS_README = path.join(REPO_ROOT, "design-system/README.md");

export const DEFAULT_ROUTES = [
  "/cardiology",
  "/cardiology/agents",
  "/cardiology/materials",
  "/cardiology/settings",
  "/cardiology/content/video-ah-current",
  "/oncology",
] as const;

/** Pages found through navigation links are added up to this total. */
export const MAX_ROUTES = 12;

export const VIEWPORTS: ReadonlyArray<{ name: Viewport; width: number; height: number; isMobile: boolean; hasTouch: boolean }> = [
  { name: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
];

/**
 * Every page waits for `load`, then fonts and a short settle. `networkidle` never
 * resolves on the video page (TASK.md), and one rule for all pages keeps runs comparable.
 */
export const NAVIGATION = { waitUntil: "load" as const, timeoutMs: 120_000, settleMs: 1_200 };

/** Tab stops visited per page for the focus check (R-13). */
export const MAX_TAB_STOPS = 200;

export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
/** Contrast is R-02 (with the DS white-on-accent exception), so axe's duplicate is not reported. */
export const AXE_EXCLUDED_RULES = ["color-contrast"];

export const STATUS_CONTEXT = "ds-audit/regression";
export const COMMENT_MARKER = "<!-- ds-audit -->";
export const DEFAULT_OUT_DIR = "ds-audit-output";
export const DEFAULT_STATE_DIR = ".ds-audit-state";
