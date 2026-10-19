export interface Cha2Ds2VaInput {
  heartFailure: boolean;
  hypertension: boolean;
  age: number;
  diabetes: boolean;
  strokeTiaEmbolism: boolean;
  vascularDisease: boolean;
}

export interface HasBledInput {
  hypertension: boolean;
  abnormalRenal: boolean;
  abnormalLiver: boolean;
  stroke: boolean;
  bleedingHistory: boolean;
  labileInr: boolean;
  ageOver65: boolean;
  drugs: boolean;
  alcohol: boolean;
}

export function scoreCha2Ds2Va(input: Cha2Ds2VaInput): number {
  let score = 0;
  if (input.heartFailure) score += 1;
  if (input.hypertension) score += 1;
  if (input.age >= 75) score += 2;
  else if (input.age >= 65) score += 1;
  if (input.diabetes) score += 1;
  if (input.strokeTiaEmbolism) score += 2;
  if (input.vascularDisease) score += 1;
  return score;
}

export function cha2Ds2VaLabel(score: number): string {
  if (score <= 0) return "0 — низкий риск по шкале";
  if (score === 1) return "1 — промежуточный риск";
  return `${score} — повышенный риск`;
}

export function scoreHasBled(input: HasBledInput): number {
  return [
    input.hypertension,
    input.abnormalRenal,
    input.abnormalLiver,
    input.stroke,
    input.bleedingHistory,
    input.labileInr,
    input.ageOver65,
    input.drugs,
    input.alcohol,
  ].filter(Boolean).length;
}

export function hasBledLabel(score: number): string {
  return score >= 3 ? `${score} — нужен более частый пересмотр факторов риска` : `${score} — ниже порога ≥3`;
}
