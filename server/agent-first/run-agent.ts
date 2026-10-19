import { agentById } from "@/lib/agent-first/agents";
import { withConfirmationPolicy } from "@/lib/agent-first/action-confirmation";
import { isNewSinceLastSeen, routeTask } from "@/lib/agent-first/supervisor";
import type {
  AgentAction,
  AgentId,
  AgentResultItem,
  Evidence,
  RunAgentResponse,
  VerificationStatus,
} from "@/lib/agent-first/types";
import type { ContentObject, SpecialtyId } from "@/lib/domain/types";
import { listContent } from "@/server/repositories/catalog";

const MAX_RESULTS = 8;

function tokenize(value: string): string[] {
  return [...new Set(value.toLocaleLowerCase("ru-RU").split(/[^\p{L}\p{N}]+/u).filter(token => token.length >= 3))];
}

function haystack(content: ContentObject): string {
  return [content.title, content.summary, content.type, ...content.topics, ...content.tags].join(" ").toLocaleLowerCase("ru-RU");
}

function searchScore(content: ContentObject, input: string): number {
  const terms = tokenize(input);
  if (!terms.length) return content.priority;
  const text = haystack(content);
  let score = 0;
  for (const term of terms) {
    if (content.title.toLocaleLowerCase("ru-RU").includes(term)) score += 5;
    if (content.summary.toLocaleLowerCase("ru-RU").includes(term)) score += 2;
    if (content.topics.some(topic => topic.toLocaleLowerCase("ru-RU").includes(term))) score += 3;
    if (content.tags.some(tag => tag.toLocaleLowerCase("ru-RU").includes(term))) score += 2;
    if (text.includes(term)) score += 1;
  }
  return score + Math.max(0, content.priority) / 100;
}

function isDrugRelated(content: ContentObject): boolean {
  if (content.kind === "drug") return true;
  return /(препарат|лекарств|фармак|антикоаг|апиксаб|риварокс|дабигатр|статин|ингибитор|sglt|арни|arni)/iu.test(haystack(content));
}

function isLearning(content: ContentObject): boolean {
  return content.kind === "video" || /(курс|лекц|образован|обуч|школ|вебинар)/iu.test(haystack(content));
}

function appliesToAgent(content: ContentObject, agentId: AgentId): boolean {
  switch (agentId) {
    case "guideline-change": return content.kind === "guideline";
    case "drug-change": return isDrugRelated(content);
    case "events": return content.kind === "event";
    case "learning": return isLearning(content);
    case "materials": return false;
    default: return true;
  }
}

function verificationStatus(content: ContentObject): VerificationStatus {
  if (!content.canonicalUrl && !content.source.url) return "UNKNOWN";
  if (content.requiresReview || content.currentness === "review") return "PARTIALLY_SUPPORTED";
  if (content.currentness === "archived" || content.currentness === "superseded") return "PARTIALLY_SUPPORTED";
  return "SUPPORTED";
}

function evidenceFor(content: ContentObject, retrievedAt: string): Evidence {
  return {
    claim: content.summary || content.title,
    sourceId: content.source.id,
    sourceName: content.source.name,
    sourceUrl: content.canonicalUrl ?? content.source.url,
    sourceType: content.source.type,
    publisher: content.source.publisher,
    publicationDate: content.publicationDate,
    retrievedAt,
    evidenceLevel: content.trustLayer || "catalog",
    confidence: null,
    verificationStatus: verificationStatus(content),
  };
}

function actionsFor(content: ContentObject, agentId: AgentId): AgentAction[] {
  const sourceUrl = content.canonicalUrl ?? content.source.url ?? undefined;
  const actions: AgentAction[] = [{ id: `${content.id}:save`, label: "Сохранить", kind: "save_material", availability: "LIVE", requiresConfirmation: false }];
  if (sourceUrl) actions.unshift({ id: `${content.id}:source`, label: agentId === "events" ? "Подробнее" : "Открыть источник", kind: "open_source", availability: "LIVE", requiresConfirmation: false, url: sourceUrl });
  if (agentId === "events") {
    if (sourceUrl) actions.push(withConfirmationPolicy({ id: `${content.id}:registration`, label: "Перейти к регистрации", kind: "open_registration", availability: "LIVE", url: sourceUrl }));
    actions.push(withConfirmationPolicy({ id: `${content.id}:calendar`, label: "Добавить в календарь", kind: "calendar_write", availability: "UNAVAILABLE", unavailableReason: "Календарь не подключён к этому preview." }));
  }
  return actions;
}

function itemFromContent(content: ContentObject, agentId: AgentId, lastSeenAt: string | null | undefined, retrievedAt: string): AgentResultItem {
  const status = verificationStatus(content);
  const newSinceLastSeen = isNewSinceLastSeen(lastSeenAt, [content.updatedAt, content.publicationDate, content.lastCheckedAt]);
  return {
    id: content.id,
    title: content.title,
    summary: content.summary,
    reasonShown: newSinceLastSeen ? "Материал датирован позже вашего предыдущего просмотра." : `Совпадает с задачей агента «${agentById[agentId].name}» и доступен в проверяемом каталоге.`,
    createdAt: content.updatedAt ?? content.publicationDate ?? content.lastCheckedAt,
    newSinceLastSeen,
    verificationStatus: status,
    evidence: [evidenceFor(content, retrievedAt)],
    actions: actionsFor(content, agentId),
  };
}

export async function runAgent(input: { specialty: SpecialtyId; prompt: string; requestedAgent?: AgentId; lastSeenAt?: string | null }): Promise<RunAgentResponse> {
  const startedAt = new Date();
  const plan = routeTask(input.prompt, input.requestedAgent);
  const retrievedAt = new Date().toISOString();
  const content = await listContent(input.specialty);
  const promptTokens = tokenize(input.prompt);

  const ranked = content
    .filter(item => appliesToAgent(item, plan.agentId))
    .map(item => ({ item, score: searchScore(item, input.prompt) }))
    .filter(entry => promptTokens.length === 0 || entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map(entry => itemFromContent(entry.item, plan.agentId, input.lastSeenAt, retrievedAt));

  const completedAt = new Date();
  const resultId = `result:${plan.agentId}:${completedAt.getTime()}`;
  const exactCount = ranked.length;
  const summary = plan.agentId === "materials"
    ? "Серверный поиск по личным материалам ещё не подключён. Добавленные в preview материалы остаются локальными в браузере."
    : exactCount
      ? `Найдено ${exactCount} релевантных объектов в текущем каталоге. Каждый результат сохраняет источник и статус проверки.`
      : "В доступном каталоге нет точного результата для этой задачи. Внешний поиск не был подменён мок-данными.";

  return {
    run: {
      id: `run:${plan.agentId}:${startedAt.getTime()}`,
      agentId: plan.agentId,
      specialty: input.specialty,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      status: "completed",
      input: input.prompt,
      toolsUsed: plan.agentId === "materials" ? ["indexUserMaterial:UNAVAILABLE"] : ["searchMedical:LIVE", "factCheck:MOCK_RULE_GATE", "riskCheck:MOCK_RULE_GATE"],
      resultIds: [resultId],
      error: null,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    },
    result: {
      id: resultId,
      agentId: plan.agentId,
      title: agentById[plan.agentId].name,
      summary,
      reasonShown: `Маршрут выбран по интенту «${plan.intent}». Пользователь видит задачу агента, а не внутренние сервисы.`,
      createdAt: completedAt.toISOString(),
      newSinceLastSeen: ranked.filter(item => item.newSinceLastSeen).length,
      items: ranked,
    },
    connectorModes: { catalog: "LIVE", pubmed: "UNAVAILABLE", calendar: "UNAVAILABLE", email: "UNAVAILABLE", "user-material-index": "UNAVAILABLE" },
  };
}
