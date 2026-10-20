import type { AccessSubjectId } from "@/lib/access/agent-entitlements";
import type { SpecialtyId } from "@/lib/domain/types";
import { PHARMA_AGENT_DEFINITIONS, planContentStudio, type PharmaOutputKind } from "./agents";

export type PartnerWorkspaceId = "partner_demo";
export type PublicationDraftStatus = "draft" | "in_review" | "approved" | "published";
export type ContentStudioPackageStatus = PublicationDraftStatus;
export type ContentStudioRunStatus = "completed" | "failed";
export type ContentStudioGenerationMode = "template_scaffold";

export interface ContentStudioBrief {
  id: string;
  rawText: string;
  audience: string;
  campaignGoal: string;
  sourceUrls: string[];
  createdAt: string;
}

export interface ContentStudioRun {
  id: string;
  agentId: "content_studio";
  status: ContentStudioRunStatus;
  mode: ContentStudioGenerationMode;
  startedAt: string;
  completedAt: string;
  steps: string[];
  note: string;
}

export interface PublicationDraft {
  id: string;
  kind: PharmaOutputKind;
  title: string;
  content: string;
  status: PublicationDraftStatus;
  evidenceStatus: "not_checked";
  disclosure: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentStudioPackage {
  id: string;
  specialty: SpecialtyId;
  workspaceId: PartnerWorkspaceId;
  ownerSubjectId: AccessSubjectId;
  brief: ContentStudioBrief;
  run: ContentStudioRun;
  drafts: PublicationDraft[];
  status: ContentStudioPackageStatus;
  reviewRequestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const FORMAT_LABELS: Record<PharmaOutputKind, string> = {
  article: "Статья",
  useful: "Полезное",
  media: "Медиа",
  event: "Событие",
  performance: "Performance",
};

export function partnerWorkspaceForSubject(subjectId: AccessSubjectId): PartnerWorkspaceId | null {
  return subjectId === "pharma_demo" || subjectId === "editorial_demo" || subjectId === "admin_demo" ? "partner_demo" : null;
}

function compact(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function seedTitle(text: string): string {
  const first = compact(text).split(/[.!?\n]/)[0]?.trim() || "Партнёрский материал";
  return first.length > 72 ? `${first.slice(0, 69)}…` : first;
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)\]}>,]+/gi) ?? [];
  return [...new Set(matches.map(url => url.replace(/[.,;:!?]+$/, "")))].slice(0, 12);
}

function inferCampaignGoal(text: string): string {
  const value = text.toLocaleLowerCase("ru-RU");
  if (/регистрац|вебинар|конференц|мероприят/.test(value)) return "Регистрация / участие в событии";
  if (/чек[- ]?лист|шпаргал|сохран|алгоритм/.test(value)) return "Практическое использование и сохранение";
  if (/исследован|стат(ья|ью|ьи)|обзор|материал/.test(value)) return "Ознакомление с материалом";
  return "Уточнить целевое действие перед review";
}

function audienceForSpecialty(specialty: SpecialtyId): string {
  return specialty === "cardiology" ? "Кардиологи" : "Онкологи";
}

function scaffold(kind: PharmaOutputKind, brief: ContentStudioBrief): string {
  const shared = `Исходный бриф\n${brief.rawText}\n\nАудитория\n${brief.audience}\n\nЦель\n${brief.campaignGoal}`;
  switch (kind) {
    case "article":
      return `${shared}\n\nРедакторская структура\n1. Краткий вывод для врача.\n2. Клинический контекст.\n3. Проверяемые claims — заполнить только после evidence-check.\n4. Первичные источники.\n5. Партнёрская маркировка и CTA.\n\nМедицинские утверждения на этом шаге не генерируются.`;
    case "useful":
      return `${shared}\n\nФормат\nОдностраничный практический материал: чек-лист / алгоритм / карточки. Каждый медицинский тезис должен быть связан с проверенным источником до публикации.`;
    case "media":
      return `${shared}\n\nФормат\nСценарий видео или подкаста: хук → 3–5 доказательных тезисов → источник → CTA. Тезисы пока не заполнены, чтобы не создавать неподтверждённые claims.`;
    case "event":
      return `${shared}\n\nФормат\nКарточка события: что получит врач → дата/формат → спикеры → программа → регистрация → напоминание. Фактические реквизиты должны прийти из исходных материалов.`;
    case "performance":
      return `${shared}\n\nФормат\nPerformance-гипотеза: сегмент → сообщение → целевое действие → метрика. Это рабочий черновик кампании, а не готовый рекламный claim.`;
  }
}

export function createContentStudioPackage(args: {
  specialty: SpecialtyId;
  ownerSubjectId: AccessSubjectId;
  briefText: string;
  now?: string;
}): ContentStudioPackage {
  const workspaceId = partnerWorkspaceForSubject(args.ownerSubjectId);
  if (!workspaceId) throw new Error("partner_workspace_required");
  const rawText = args.briefText.trim();
  if (!rawText) throw new Error("brief_required");
  const now = args.now ?? new Date().toISOString();
  const plan = planContentStudio(rawText);
  const brief: ContentStudioBrief = {
    id: `brief-${crypto.randomUUID()}`,
    rawText,
    audience: audienceForSpecialty(args.specialty),
    campaignGoal: inferCampaignGoal(rawText),
    sourceUrls: extractUrls(rawText),
    createdAt: now,
  };
  const titleSeed = seedTitle(rawText);
  const drafts = PHARMA_AGENT_DEFINITIONS.content_studio.outputs.map(kind => ({
    id: `draft-${crypto.randomUUID()}`,
    kind,
    title: `${FORMAT_LABELS[kind]} · ${titleSeed}`,
    content: scaffold(kind, brief),
    status: "draft" as const,
    evidenceStatus: "not_checked" as const,
    disclosure: "Партнёрский материал · рабочий черновик",
    createdAt: now,
    updatedAt: now,
  }));
  return {
    id: `pkg-${crypto.randomUUID()}`,
    specialty: args.specialty,
    workspaceId,
    ownerSubjectId: args.ownerSubjectId,
    brief,
    run: {
      id: `phrun-${crypto.randomUUID()}`,
      agentId: "content_studio",
      status: "completed",
      mode: "template_scaffold",
      startedAt: now,
      completedAt: now,
      steps: [...plan.steps],
      note: "Создана персистентная структура пакета. Текстовые scaffolds не являются evidence-verified медицинским контентом.",
    },
    drafts,
    status: "draft",
    reviewRequestedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function updatePublicationDraft(
  pkg: ContentStudioPackage,
  draftId: string,
  patch: { title?: string; content?: string },
  now = new Date().toISOString(),
): ContentStudioPackage {
  if (pkg.status !== "draft") throw new Error("package_not_editable");
  const draft = pkg.drafts.find(item => item.id === draftId);
  if (!draft) throw new Error("draft_not_found");
  const title = patch.title === undefined ? draft.title : compact(patch.title);
  const content = patch.content === undefined ? draft.content : patch.content.trim();
  if (!title || !content) throw new Error("draft_content_required");
  return {
    ...pkg,
    drafts: pkg.drafts.map(item => item.id === draftId ? { ...item, title, content, updatedAt: now } : item),
    updatedAt: now,
  };
}

export function requestContentStudioReview(pkg: ContentStudioPackage, now = new Date().toISOString()): ContentStudioPackage {
  if (pkg.status !== "draft") throw new Error("package_not_reviewable");
  return {
    ...pkg,
    status: "in_review",
    reviewRequestedAt: now,
    updatedAt: now,
    drafts: pkg.drafts.map(draft => ({ ...draft, status: "in_review", updatedAt: now })),
  };
}
