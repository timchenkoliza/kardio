import type { SourceResult } from "@/lib/mesh/evidence";
import type { SourceDescriptor, SourceStatusReport } from "@/lib/mesh/sources";
import { emptyResult } from "./common";
import type { SourceAdapter, SourceRequest } from "./types";

/**
 * Official sources that are not connected. They are never executed and never
 * simulated: the plan records them as hand-offs and the physician gets a
 * verified link to check the official status personally.
 */

const HANDOFF_USAGE = { robots: null, terms: null, audience: "public" as const, reuse: "link_only" as const, maxExcerptChars: null, attributionRequired: true, rateLimitPerMinute: null, agreement: "none" as const, jurisdiction: "RU" as const };

export const RUBRICATOR_DESCRIPTOR: SourceDescriptor = {
  id: "minzdrav_rubricator",
  name: "Рубрикатор клинических рекомендаций Минздрава",
  connectorId: "cr-rubricator",
  domains: ["guideline"],
  specialties: "all",
  jobs: ["guideline_check", "guideline_discovery", "disease_reference", "reference_answer", "source_positions"],
  provides: ["official_guideline_status"],
  operations: ["handoff"],
  authority: "official",
  execution: "manual-handoff",
  freshnessPolicy: { kind: "live", reverifyAfterHours: null, note: "Проверяется врачом по ссылке" },
  cachePolicy: { scope: "none", ttlSeconds: 0 },
  usagePolicy: { ...HANDOFF_USAGE, openQuestions: ["Программный доступ к cr.minzdrav.gov.ru нестабилен; нужен официальный канал данных"] },
  cost: 0,
  handoffUrl: "https://cr.minzdrav.gov.ru/",
};

export const GRLS_DESCRIPTOR: SourceDescriptor = {
  id: "grls",
  name: "ГРЛС Минздрава",
  connectorId: "grls",
  domains: ["drug", "regulatory"],
  specialties: "all",
  jobs: ["drug_reference", "drug_comparison", "inn_lookup", "reference_answer", "guideline_check", "source_positions"],
  provides: ["official_drug_registration"],
  operations: ["handoff"],
  authority: "official",
  execution: "manual-handoff",
  freshnessPolicy: { kind: "live", reverifyAfterHours: null, note: "Проверяется врачом по ссылке" },
  cachePolicy: { scope: "none", ttlSeconds: 0 },
  usagePolicy: { ...HANDOFF_USAGE, openQuestions: ["ГРЛС не подключён; официальный статус регистрации и инструкции не утверждается"] },
  cost: 0,
  handoffUrl: "https://grls.rosminzdrav.ru/",
};

function handoffAdapter(descriptor: SourceDescriptor): SourceAdapter {
  const status = async (): Promise<SourceStatusReport> => ({ status: "HANDOFF", reason: "Не подключён: проверка по ссылке", execution: "manual-handoff" });
  return {
    ...descriptor,
    status,
    async execute(request: SourceRequest): Promise<SourceResult> {
      return emptyResult(request, { sourceId: descriptor.id, outcome: "handoff", status: "HANDOFF", execution: "manual-handoff", started: Date.now(), note: descriptor.usagePolicy.openQuestions[0] ?? null, urls: descriptor.handoffUrl ? [descriptor.handoffUrl] : [] });
    },
  };
}

export const createRubricatorAdapter = () => handoffAdapter(RUBRICATOR_DESCRIPTOR);
export const createGrlsAdapter = () => handoffAdapter(GRLS_DESCRIPTOR);
