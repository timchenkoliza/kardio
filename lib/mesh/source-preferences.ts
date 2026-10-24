import { SOURCE_OPTIONS } from "@/lib/agents/vocabulary";
import type { SourceId } from "./sources";

/**
 * The physician's source settings (profile option ids, SOURCE_OPTIONS)
 * resolved for the source mesh. Every mesh consumer reads them through here:
 *
 *   «Не использовать» → the planner does not plan the whole sources; the
 *                       PubMed adapter drops publications of the journals
 *   «Приоритет»       → the compiler ranks that evidence first among items
 *                       that are otherwise equal; it never adds, removes or
 *                       filters evidence
 *
 * An option with neither a mesh source nor a journal (НМО, Telegram) has no
 * effect on answers. Unknown ids are ignored.
 */

export interface MeshSourcePreference {
  /** Whole mesh sources the options stand for. */
  sources: SourceId[];
  /** PubMed journals (NLM abbreviations) the options stand for. */
  journals: string[];
}

export function meshSourcePreference(optionIds: readonly string[]): MeshSourcePreference {
  const options = SOURCE_OPTIONS.filter(option => optionIds.includes(option.id));
  return {
    sources: [...new Set(options.flatMap(option => option.meshSources))],
    journals: [...new Set(options.map(option => option.pubmedJournal).filter((journal): journal is string => Boolean(journal)))],
  };
}

/** NLM abbreviations compare case-insensitively and without a trailing dot («Lancet.» = «Lancet»). */
function journalKey(journal: string): string {
  return journal.trim().toLowerCase().replace(/\.$/u, "");
}

export function matchesJournal(journal: unknown, journals: readonly string[]): boolean {
  if (typeof journal !== "string" || !journal.trim()) return false;
  const key = journalKey(journal);
  return journals.some(item => journalKey(item) === key);
}

/** The options' own names of the journals the physician excluded («The Lancet»), as the profile shows them. */
export function excludedJournalLabels(optionIds: readonly string[], among?: readonly string[]): string[] {
  return SOURCE_OPTIONS.filter(option => optionIds.includes(option.id) && option.pubmedJournal && (!among || matchesJournal(option.pubmedJournal, among))).map(option => option.label);
}

/** PubMed invocation notes about excluded journals (server/mesh/sources/pubmed.ts) → one line of «Чего не хватает». */
const WITHHELD_NOTE = /скрыты публикации журналов, исключённых в ваших источниках \(([^)]+)\): (\d+)/u;
const KEPT_OUT_NOTE = /журналы, исключённые в ваших источниках, не показываем: (.+)$/u;
export const keptOutJournalsNote = (labels: readonly string[]) => `журналы, исключённые в ваших источниках, не показываем: ${labels.join(", ")}`;

export function excludedJournalsGap(note: string | null | undefined): string | null {
  for (const part of (note ?? "").split("; ")) {
    const withheld = part.match(WITHHELD_NOTE);
    const keptOut = withheld ? null : part.match(KEPT_OUT_NOTE);
    const names = withheld?.[1] ?? keptOut?.[1];
    if (!names) continue;
    const many = names.includes(",");
    // The physician's own setting, named, so «Изменить источники» next to it is the way back (R1 A round 2 №3).
    return `${names} — ${many ? "исключены" : "исключён"} в ваших источниках: публикации ${many ? "этих журналов" : "журнала"} не показываем${withheld ? ` (скрыто: ${withheld[2]})` : ""}`;
  }
  return null;
}
