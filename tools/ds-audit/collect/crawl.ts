import { MAX_ROUTES } from "../config";
import { normalizeRoute } from "../identity/fingerprint";
import type { PageSnapshot } from "../types";

/** Same-origin paths from navigation links that are not audited yet, sorted, up to MAX_ROUTES in total. */
export function discoverRoutes(snapshots: PageSnapshot[], known: string[], origin: string): string[] {
  const have = new Set(known.map(normalizeRoute));
  const found = new Set<string>();
  for (const snapshot of snapshots) {
    for (const href of snapshot.navLinks) {
      let url: URL;
      try { url = new URL(href, origin); } catch { continue; }
      if (url.origin !== new URL(origin).origin) continue;
      const route = normalizeRoute(url.pathname);
      if (!have.has(route) && route !== "/") found.add(route);
    }
  }
  return [...found].sort().slice(0, Math.max(0, MAX_ROUTES - have.size));
}
