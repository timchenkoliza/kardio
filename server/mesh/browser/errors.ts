/**
 * Explicit failure taxonomy of browser-capable sources. A source that cannot
 * do its job says exactly why; nothing downstream may turn this into a
 * successful-looking result.
 */
export type SourceToolErrorCode =
  | "robots_disallow"
  | "outside_allowed_paths"
  | "layout_changed"
  | "not_found"
  | "http_error"
  | "network"
  | "timeout"
  | "driver_unavailable"
  | "interaction_unsupported"
  | "page_budget_exceeded";

export class SourceToolError extends Error {
  readonly code: SourceToolErrorCode;
  readonly detail: string;
  readonly url: string | null;

  constructor(code: SourceToolErrorCode, detail: string, url: string | null = null) {
    super(`${code}: ${detail}`);
    this.name = "SourceToolError";
    this.code = code;
    this.detail = detail;
    this.url = url;
  }

  /** Stable machine-readable code for traces and telemetry, e.g. `layout_changed:medi.instruction:h1`. */
  get machineCode(): string {
    return `${this.code}:${this.detail}`.slice(0, 160);
  }
}

export function isSourceToolError(error: unknown): error is SourceToolError {
  return error instanceof SourceToolError;
}
