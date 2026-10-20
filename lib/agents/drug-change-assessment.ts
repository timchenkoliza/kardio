import type { DrugChangeType, ResultAttributeValue } from "./types";

export type DrugChangeBasis =
  | "primary_regulator"
  | "secondary_regulatory_report"
  | "guideline_context"
  | "pubmed_metadata"
  | "secondary_study_report"
  | "announcement";

export type DrugOfficialVerification =
  | "confirmed_primary"
  | "needs_grls"
  | "needs_primary_source"
  | "not_applicable";

export interface DrugChangeAssessment {
  basis: DrugChangeBasis;
  officialVerification: DrugOfficialVerification;
  sourceBasisLabel: string;
  officialVerificationLabel: string | null;
  verificationTarget: string | null;
  grlsRequired: boolean;
  practiceImpact: string | null;
}

const REGULATORY_TYPES = new Set<DrugChangeType>([
  "NEW_REGISTRATION",
  "WITHDRAWAL",
  "NEW_RESTRICTION",
  "LABEL_CHANGE",
]);

export function isRegulatoryDrugChange(type: DrugChangeType): boolean {
  return REGULATORY_TYPES.has(type);
}

export function assessDrugChange(args: {
  type: DrugChangeType;
  region: "RU" | "US" | "EU" | "INTL";
  status: "effective" | "announced";
  sourceKind: "primary" | "secondary";
  verificationTarget: string | null;
  practiceImpact?: string | null;
}): DrugChangeAssessment {
  if (args.type === "GUIDELINE_CHANGE") {
    return {
      basis: "guideline_context",
      officialVerification: "not_applicable",
      sourceBasisLabel: "Контекст клинических рекомендаций",
      officialVerificationLabel: null,
      verificationTarget: args.verificationTarget,
      grlsRequired: false,
      practiceImpact: args.practiceImpact ?? "Изменение рекомендации не означает автоматического изменения российской инструкции или регистрационного статуса препарата.",
    };
  }

  if (args.type === "IMPORTANT_NEW_STUDY") {
    return {
      basis: args.sourceKind === "primary" ? "pubmed_metadata" : "secondary_study_report",
      officialVerification: "not_applicable",
      sourceBasisLabel: args.sourceKind === "primary" ? "Публикация / библиографические данные" : "Сообщение об исследовании во вторичном источнике",
      officialVerificationLabel: null,
      verificationTarget: args.verificationTarget,
      grlsRequired: false,
      practiceImpact: args.practiceImpact ?? "Результат исследования сам по себе не меняет инструкцию, регистрацию или клинические рекомендации.",
    };
  }

  if (args.status === "announced") {
    return {
      basis: "announcement",
      officialVerification: args.region === "RU" ? "needs_grls" : "needs_primary_source",
      sourceBasisLabel: "Анонс; не подтверждённое вступившее в силу изменение",
      officialVerificationLabel: args.region === "RU" ? "Не подтверждено ГРЛС" : "Нужно подтверждение первичного регуляторного источника",
      verificationTarget: args.verificationTarget,
      grlsRequired: args.region === "RU",
      practiceImpact: args.practiceImpact ?? (args.region === "RU"
        ? "Не считать препарат зарегистрированным в РФ до появления подтверждаемой записи ГРЛС."
        : "Не считать изменение вступившим в силу до подтверждения первичным регуляторным источником."),
    };
  }

  if (args.region === "RU" && isRegulatoryDrugChange(args.type)) {
    return {
      basis: args.sourceKind === "primary" ? "primary_regulator" : "secondary_regulatory_report",
      officialVerification: "needs_grls",
      sourceBasisLabel: args.sourceKind === "primary" ? "Первичный публичный источник вне ГРЛС" : "Вторичное сообщение о регуляторном изменении",
      officialVerificationLabel: "Официальный статус РФ требует сверки ГРЛС",
      verificationTarget: "ГРЛС (grls.rosminzdrav.ru)",
      grlsRequired: true,
      practiceImpact: args.practiceImpact ?? "До сверки ГРЛС использовать запись только как сигнал об изменении, а не как подтверждённый официальный статус в РФ.",
    };
  }

  if (isRegulatoryDrugChange(args.type) && args.sourceKind === "secondary") {
    return {
      basis: "secondary_regulatory_report",
      officialVerification: "needs_primary_source",
      sourceBasisLabel: "Вторичное сообщение о регуляторном изменении",
      officialVerificationLabel: "Нужно подтверждение первичного регуляторного источника",
      verificationTarget: args.verificationTarget,
      grlsRequired: false,
      practiceImpact: args.practiceImpact ?? "Использовать как регуляторный сигнал до сверки официальной записи или инструкции.",
    };
  }

  return {
    basis: "primary_regulator",
    officialVerification: "confirmed_primary",
    sourceBasisLabel: "Первичный регуляторный источник",
    officialVerificationLabel: "Подтверждено первичным регуляторным источником",
    verificationTarget: args.verificationTarget,
    grlsRequired: false,
    practiceImpact: args.practiceImpact ?? null,
  };
}

const PREFIX = "drugAssessment";

export function drugAssessmentToAttributes(value: DrugChangeAssessment): Record<string, ResultAttributeValue> {
  return {
    [`${PREFIX}.basis`]: value.basis,
    [`${PREFIX}.officialVerification`]: value.officialVerification,
    [`${PREFIX}.sourceBasisLabel`]: value.sourceBasisLabel,
    [`${PREFIX}.officialVerificationLabel`]: value.officialVerificationLabel,
    [`${PREFIX}.verificationTarget`]: value.verificationTarget,
    [`${PREFIX}.grlsRequired`]: value.grlsRequired,
    [`${PREFIX}.practiceImpact`]: value.practiceImpact,
  };
}

export function drugAssessmentFromAttributes(attributes: Record<string, ResultAttributeValue>): DrugChangeAssessment | null {
  const basis = attributes[`${PREFIX}.basis`];
  const officialVerification = attributes[`${PREFIX}.officialVerification`];
  if (
    basis !== "primary_regulator"
    && basis !== "secondary_regulatory_report"
    && basis !== "guideline_context"
    && basis !== "pubmed_metadata"
    && basis !== "secondary_study_report"
    && basis !== "announcement"
  ) return null;
  if (
    officialVerification !== "confirmed_primary"
    && officialVerification !== "needs_grls"
    && officialVerification !== "needs_primary_source"
    && officialVerification !== "not_applicable"
  ) return null;
  const text = (key: string) => typeof attributes[key] === "string" && String(attributes[key]).trim() ? String(attributes[key]) : null;
  return {
    basis,
    officialVerification,
    sourceBasisLabel: text(`${PREFIX}.sourceBasisLabel`) ?? basis,
    officialVerificationLabel: text(`${PREFIX}.officialVerificationLabel`),
    verificationTarget: text(`${PREFIX}.verificationTarget`),
    grlsRequired: attributes[`${PREFIX}.grlsRequired`] === true,
    practiceImpact: text(`${PREFIX}.practiceImpact`),
  };
}
