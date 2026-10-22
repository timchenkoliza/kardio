import { SKILLS as CARDIOLOGY } from "./cardiology";
import { SKILLS as ENDOCRINOLOGY } from "./endocrinology";
import { SKILLS as NEUROLOGY } from "./neurology";
import { SKILLS as OBGYN } from "./obgyn";
import { SKILLS as PEDIATRICS } from "./pediatrics";
import { SKILLS as THERAPY } from "./therapy";
import type { IntentSkill } from "./types";

/** The internal Skills library. Never navigation: physicians see what is done, not which Skill did it. */
export const SKILL_LIBRARY: readonly IntentSkill[] = [...CARDIOLOGY, ...THERAPY, ...PEDIATRICS, ...OBGYN, ...NEUROLOGY, ...ENDOCRINOLOGY];

export function skillById(id: string): IntentSkill | null {
  return SKILL_LIBRARY.find(skill => skill.id === id) ?? null;
}
