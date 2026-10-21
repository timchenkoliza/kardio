import type { RobotsSnapshot } from "@/lib/mesh/sources";

/**
 * robots.txt guard. Automated access honours the site's own rules: the
 * snapshot recorded in the source's usage policy is the floor, and a live
 * robots.txt (re-read at most once a day) can only add restrictions.
 */

export function parseRobots(text: string): string[] {
  const disallow: string[] = [];
  let applies = false;
  let sawRule = false;
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.replace(/#.*$/u, "").trim();
    if (!line) continue;
    const [key, ...rest] = line.split(":");
    const field = key.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (field === "user-agent") {
      if (sawRule) { applies = false; sawRule = false; }
      if (value === "*") applies = true;
      continue;
    }
    if (field === "disallow" || field === "allow") sawRule = true;
    if (applies && field === "disallow" && value) disallow.push(value);
  }
  return [...new Set(disallow)];
}

function ruleMatches(path: string, rule: string): boolean {
  // Supports the common `*` wildcard and `$` anchor of robots.txt.
  const pattern = rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\$$/u, "$").replace(/\*/g, ".*");
  return new RegExp(`^${pattern}`, "u").test(path);
}

export function isAllowedByRobots(url: string, disallow: readonly string[]): boolean {
  const { pathname, search } = new URL(url);
  const path = `${pathname}${search}`;
  return !disallow.some(rule => ruleMatches(path, rule));
}

export class RobotsGuard {
  private live: { disallow: string[]; fetchedAt: number } | null = null;
  private pending: Promise<void> | null = null;

  constructor(private readonly snapshot: RobotsSnapshot, private readonly fetchText: (url: string) => Promise<string | null>) {}

  private async refresh(): Promise<void> {
    if (this.live && Date.now() - this.live.fetchedAt < 24 * 3_600_000) return;
    if (!this.pending) {
      this.pending = (async () => {
        const text = await this.fetchText(this.snapshot.url).catch(() => null);
        // A failed refresh keeps the recorded snapshot; it never loosens it.
        this.live = { disallow: text ? parseRobots(text) : [], fetchedAt: Date.now() };
      })().finally(() => { this.pending = null; });
    }
    await this.pending;
  }

  async disallowed(): Promise<string[]> {
    await this.refresh();
    return [...new Set([...this.snapshot.disallow, ...(this.live?.disallow ?? [])])];
  }

  async check(url: string): Promise<{ allowed: boolean; rule: string | null }> {
    const rules = await this.disallowed();
    const { pathname, search } = new URL(url);
    const rule = rules.find(item => ruleMatches(`${pathname}${search}`, item)) ?? null;
    return { allowed: !rule, rule };
  }
}
