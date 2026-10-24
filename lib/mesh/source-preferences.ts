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
