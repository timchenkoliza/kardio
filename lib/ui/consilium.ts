export type ConsiliumPersona = {
  id: string;
  displayName: string;
  role: string;
  lens: string;
  riskFocus: string;
};

export type ConsiliumReply = {
  personaId: string;
  body: string;
};

export const consiliumPersonas: ConsiliumPersona[] = [
  { id: "outpatient", displayName: "А. Морозова", role: "Амбулаторный кардиолог", lens: "приверженность и жизнеспособность терапии", riskFocus: "потеря наблюдения и декомпенсация" },
  { id: "hf", displayName: "И. Соколов", role: "Специалист по сердечной недостаточности", lens: "прогноз и модификация риска", riskFocus: "гипотония, функция почек, декомпенсация" },
  { id: "arrhythmia", displayName: "Н. Белова", role: "Аритмолог", lens: "ритм и тромбоэмболический риск", riskFocus: "аритмогенность, взаимодействия, кровотечения" },
  { id: "pharm", displayName: "Е. Орлова", role: "Клинический фармаколог", lens: "взаимодействия, дозирование и переносимость", riskFocus: "полипрагмазия и лекарственные взаимодействия" },
  { id: "interventional", displayName: "М. Крылов", role: "Интервенционный кардиолог", lens: "острый риск и место вмешательства", riskFocus: "ишемические события и procedural risk" },
];

function classifyPrompt(prompt: string): "drug" | "safety" | "guideline" | "choice" | "general" {
  const text = prompt.toLocaleLowerCase("ru-RU");
  if (/безопас|перенос|взаимодейств|кровотеч|побоч/.test(text)) return "safety";
  if (/рекомендац|гайдлайн|guideline|esc|рко/.test(text)) return "guideline";
  if (/сравн|выбор|вариант|альтернатив/.test(text)) return "choice";
  if (/препарат|лекар|мнн|апикс|ривар|сакуб/.test(text)) return "drug";
  return "general";
}

export function deterministicConsiliumReply(persona: ConsiliumPersona, prompt: string, contextLabel?: string): string {
  const kind = classifyPrompt(prompt);
  const subject = contextLabel ? `Для контекста «${contextLabel}» ` : "";
  if (persona.id === "pharm") return `${subject}я бы сначала проверила лекарственные взаимодействия, функцию почек/печени, дозирование и факторы переносимости. Без этих данных корректно ранжировать варианты нельзя.`;
  if (persona.id === "arrhythmia") return `${subject}я бы отдельно посмотрела на риск инсульта, кровотечения, характеристики ритма и сопутствующую антиаритмическую терапию. ${kind === "drug" ? "Сравнение препарата имеет смысл только в конкретном показании." : "Нужны данные, которые меняют ритмологическую тактику."}`;
  if (persona.id === "hf") return `${subject}для меня ключевое — влияние решения на прогноз, симптомы, давление и функцию почек. ${kind === "guideline" ? "Сначала сопоставил бы вопрос с актуальными рекомендациями и уровнем доказательности." : "Если в базе нет достаточного источника, это нужно оставить как неопределённость."}`;
  if (persona.id === "interventional") return `${subject}я бы уточнил, есть ли признаки высокого ишемического или процедурного риска, которые меняют место медикаментозной стратегии. Без клинического контекста можно обсуждать только профессиональные критерии, не назначение пациенту.`;
  return `${subject}я бы оценивала не только доказательность, но и то, насколько стратегия выполнима в длительном наблюдении: доступность, кратность, контроль и приверженность. ${kind === "choice" ? "Сравнение стоит вести по одинаковым критериям для всех вариантов." : "Нужно явно отделить подтверждённые факты от экспертной интерпретации."}`;
}

export function buildConsiliumSynthesis(replies: ConsiliumReply[]): { agree: string[]; disagree: string[]; clarify: string[] } {
  const ids = new Set(replies.map(reply => reply.personaId));
  return {
    agree: ["Нужен явный клинический контекст и проверяемые источники.", "Решение нельзя сводить к одному агрегированному баллу."],
    disagree: ids.has("pharm") && ids.has("interventional") ? ["Приоритеты различаются: лекарственная безопасность против места вмешательства и острого риска."] : ["Персоны расставляют разные приоритеты, но не дают ложного единого ответа."],
    clarify: ["Какое показание обсуждается?", "Какие данные или источники должны изменить решение?"],
  };
}
