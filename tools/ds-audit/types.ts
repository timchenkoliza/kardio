export type Viewport = "desktop" | "mobile";
export type Priority = "P0" | "P1" | "P2" | "P3";
export type FindingStatus = "NEW" | "EXISTING" | "FIXED";
export type Layer = "deterministic" | "semantic";

export interface TextItem {
  component: string;
  instance: string;
  tag: string;
  text: string;
  /** Own text with ASCII whitespace collapsed; no-break spaces preserved. */
  raw: string;
  fontSize: number | null;
  lineHeight: number | null;
  lineHeightRatio: number | null;
  fontWeight: number | null;
  colorRaw: string | null;
  fg: string | null;
  bg: string | null;
  bgLayers: string[];
  bgImage: boolean;
  contrast: number | null;
  inSvg: boolean;
  disabled: boolean;
  primaryButton: boolean;
  role: "heading" | "summary" | "other";
  excluded: boolean;
  kind: "text" | "placeholder" | "select";
}

export interface TargetItem {
  component: string;
  instance: string;
  tag: string;
  name: string;
  width: number;
  height: number;
  inText: boolean;
  excluded: boolean;
}

export interface CssRuleItem {
  sheet: string;
  media: string;
  selector: string;
  declarations: Array<[string, string]>;
}

export interface FocusItem {
  component: string;
  instance: string;
  tag: string;
  outlineStyle: string;
  outlineWidth: number;
  boxShadow: string;
  indicator: "self" | "ancestor" | null;
  excluded: boolean;
}

export interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  tags: string[];
  nodes: Array<{ target: string; component: string | null; html: string }>;
}

export interface PageSnapshot {
  route: string;
  viewport: Viewport;
  url: string;
  status: number | null;
  error: string | null;
  title: string;
  lang: string | null;
  bodyText: string;
  texts: TextItem[];
  backgrounds: Array<{ component: string; color: string; excluded: boolean }>;
  targets: TargetItem[];
  headings: Array<{ level: number; component: string; text: string }>;
  h1Count: number;
  images: Array<{ component: string; src: string; alt: string | null }>;
  navLinks: string[];
  css: CssRuleItem[];
  focus: FocusItem[];
  axe: AxeViolation[];
  screenshot: string | null;
}

/** Finding as defined in TASK.md, plus identity and regression fields. */
export interface Finding {
  id: string;
  priority: Priority;
  pages: string[];
  viewport: Viewport | "both";
  fact: string;
  rule: string;
  fix: string;
  where: string;
  check: string;
  blocking: boolean;
  fingerprint: string;
  status: FindingStatus;
  layer: Layer;
  occurrences: number;
  examples: string[];
}

/** What a rule returns before identity, aggregation and classification. */
export interface RawFinding {
  id: string;
  route: string;
  viewport: Viewport | "both";
  /** Stable locator of the violating thing (component or instance level). */
  locator: string;
  /** Identity of the violation itself (e.g. the off-palette hex), never a measured size. */
  evidenceKey: string;
  fact: string;
  where: string;
  example?: string;
  blocking?: boolean;
  priority?: Priority;
}

export interface RuleContext {
  snapshots: PageSnapshot[];
  ds: import("./tokens").DesignSystem;
  year: number;
}

export interface Rule {
  id: string;
  title: string;
  /** Bump only when what counts as "the same finding" changes; it is part of the fingerprint. */
  identityVersion: number;
  priority: Priority;
  blocking: boolean;
  rule: string;
  fix: string;
  check: string;
  run(ctx: RuleContext): RawFinding[];
}

export type BaselineStatus = "exact" | "recomputed" | "unavailable" | "not_applicable";

export interface SemanticSummary {
  mode: "pr" | "deep" | "skipped";
  model: string | null;
  effort: string | null;
  routes: string[];
  cache_hits: number;
  cost_usd: number;
  skipped_reason: string | null;
}

export interface Report {
  ds_version: string;
  ruleset_version: string;
  auditor_version: string;
  commit_sha: string | null;
  base_sha: string | null;
  baseline_sha: string | null;
  baseline_status: BaselineStatus;
  preview_url: string;
  base_url: string | null;
  mode: "preview" | "baseline" | "manual" | "deep";
  routes: string[];
  viewports: Viewport[];
  count_new: number;
  count_existing: number;
  count_fixed: number;
  gate: Gate;
  findings: Finding[];
  fixed: Finding[];
  /** Baseline findings on routes this run did not audit: not compared, not FIXED. */
  not_compared: number;
  semantic: SemanticSummary;
  page_errors: Array<{ route: string; viewport: Viewport; error: string }>;
  /** The only non-deterministic field; excluded from comparisons. */
  generated_at: string;
}

export interface Gate {
  state: "success" | "failure";
  blocking_new: number;
  advisory: boolean;
  description: string;
}
