import { topicLabels } from "@/lib/agents/vocabulary";
import type { SpecialtyId } from "@/lib/domain/types";

/**
 * Prompt suggestions: whole queries a physician can send as they are. They
 * are text for the one input — never a mode and never a job. The specialty
 * examples come first; the profile's topics add one question each.
 */

export const SUGGESTIONS: Record<SpecialtyId, readonly string[]> = {
  therapy: ["Длительность антибиотикотерапии при внебольничной пневмонии", "Аторвастатин: противопоказания", "Клинические рекомендации по ХОБЛ"],
  pediatrics: ["Острый средний отит у детей: когда показаны антибиотики", "Ибупрофен у детей: дозирование", "Рекомендации по бронхиолиту"],
  obgyn: ["Аспирин для профилактики преэклампсии", "Прогестерон при угрозе преждевременных родов", "Рекомендации по гестационному диабету"],
  cardiology: ["Что изменилось в рекомендациях по ХСН?", "Апиксабан: противопоказания и взаимодействия", "ПОАК при фибрилляции предсердий у пожилых"],
  neurology: ["Профилактика мигрени у взрослых", "Леветирацетам при беременности", "Рекомендации по рассеянному склерозу"],
  endocrinology: ["Метформин при сниженной функции почек", "Семаглутид: противопоказания", "Рекомендации по лечению гипотиреоза"],
  oncology: ["Иммунотерапия рака лёгкого: систематические обзоры", "Поддерживающая терапия: что нового"],
};

const MAX_SUGGESTIONS = 6;

export function homeSuggestions(specialty: SpecialtyId, topics: readonly string[] = []): string[] {
  const own = topicLabels(specialty, topics).slice(0, 2).map(label => `Что нового по теме «${label}»`);
  return [...new Set([...SUGGESTIONS[specialty], ...own])].slice(0, MAX_SUGGESTIONS);
}
