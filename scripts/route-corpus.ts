/**
 * Route and word corpus: how every known physician question is routed and
 * which words the product recognises, as TSV — so an update can be compared
 * with the commit before it (docs/REVIEW_PROTOCOL.md, mandatory gate).
 *
 *   npx tsx scripts/route-corpus.ts > /tmp/routes-new.tsv
 *   npx tsx scripts/route-corpus.ts --compare /tmp/routes-old.tsv /tmp/routes-new.tsv
 *
 * For the «before» side run the first command in a worktree of the base
 * commit (`git worktree add /tmp/kardio-base <sha>`).
 *
 * The corpus is every Cyrillic question-like string literal in tests and
 * suggestions, plus tests/fixtures/route-corpus.txt; each is routed for the
 * specialties listed below.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { topicsMentioned } from "@/lib/agents/vocabulary";
import type { SpecialtyId } from "@/lib/domain/types";
import { conceptsIn, latinTermsIn } from "@/lib/portal/lexicon";
import { routePortalIntent } from "@/lib/portal/router";

const SPECIALTIES: readonly SpecialtyId[] = ["cardiology", "therapy", "neurology", "endocrinology", "pediatrics", "obgyn"];
const ROOTS = ["tests/unit", "tests/e2e", "lib/portal/suggestions.ts"];
const EXTRA = "tests/fixtures/route-corpus.txt";

function files(root: string): string[] {
  const full = path.resolve(root);
  try {
    if (statSync(full).isFile()) return [full];
    return readdirSync(full).flatMap(name => files(path.join(root, name)));
  } catch {
    return [];
  }
}

/** A question: 2–16 words, Cyrillic, no template or code syntax. */
function questionLike(value: string): boolean {
  const words = value.trim().split(/\s+/u);
  return /[А-Яа-яЁё]{3}/u.test(value) && words.length >= 2 && words.length <= 16 && value.length <= 140 && !/[{}<>$`\\]|\(\?|=>/u.test(value);
}

export function corpus(): string[] {
  const found = new Set<string>();
  for (const file of ROOTS.flatMap(files).filter(name => /\.(?:ts|tsx)$/u.test(name))) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/"((?:[^"\\\n]|\\.){6,140})"|'((?:[^'\\\n]|\\.){6,140})'/gu)) {
      const value = (match[1] ?? match[2] ?? "").replace(/\\"/gu, '"');
      if (questionLike(value)) found.add(value.trim());
    }
  }
  try {
    for (const line of readFileSync(EXTRA, "utf8").split("\n")) if (line.trim() && !line.startsWith("#")) found.add(line.trim());
  } catch {
    // The extra corpus is optional.
  }
  return [...found].sort((a, b) => a.localeCompare(b, "ru"));
}

function row(question: string, specialty: SpecialtyId): string {
  const route = routePortalIntent(question, specialty);
  const concepts = conceptsIn(question, specialty).map(concept => concept.id).sort();
  const topics = topicsMentioned(specialty, question).sort();
  return [question, specialty, route.job, route.vague ? "vague" : "-", concepts.join(",") || "-", topics.join(",") || "-", latinTermsIn(question).join(",") || "-", route.drugs.map(drug => drug.inn).join(",") || "-"].join("\t");
}

function load(file: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const parts = line.split("\t");
    if (parts.length >= 8) out.set(`${parts[0]}\t${parts[1]}`, parts.slice(2));
  }
  return out;
}

const COLUMNS = ["job", "vague", "concepts", "topics", "latin", "drugs"];

function compare(oldFile: string, newFile: string): number {
  const before = load(oldFile);
  const after = load(newFile);
  let routeChanges = 0;
  let wordChanges = 0;
  for (const [key, was] of before) {
    const now = after.get(key);
    if (!now) continue;
    const changed = COLUMNS.filter((_, index) => was[index] !== now[index]);
    if (!changed.length) continue;
    if (changed.includes("job")) routeChanges += 1; else wordChanges += 1;
    const [question, specialty] = key.split("\t");
    console.log(`${changed.includes("job") ? "ROUTE" : "WORDS"}\t${specialty}\t${question}\t${changed.map(column => `${column}: ${was[COLUMNS.indexOf(column)]} → ${now[COLUMNS.indexOf(column)]}`).join("; ")}`);
  }
  const added = [...after.keys()].filter(key => !before.has(key)).length;
  console.log(`\nroute changes: ${routeChanges}; word changes: ${wordChanges}; questions compared: ${before.size}; new in corpus: ${added}`);
  return routeChanges + wordChanges;
}

if (process.argv[2] === "--compare") {
  compare(process.argv[3]!, process.argv[4]!);
} else {
  for (const question of corpus()) for (const specialty of SPECIALTIES) console.log(row(question, specialty));
}
