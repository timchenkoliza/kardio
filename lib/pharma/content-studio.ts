import type { AccessSubjectId } from "@/lib/access/agent-entitlements";
import type { SourceStanding } from "@/lib/agents/source-policy";
import type { VerificationStatus } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";
import { PHARMA_AGENT_DEFINITIONS, planContentStudio, type PharmaOutputKind } from "./agents";

export type PartnerWorkspaceId = "partner_demo";
export type PublicationDraftStatus = "draft" | "in_review" | "approved" | "published";
export type ContentStudioPackageStatus = PublicationDraftStatus;
export type ContentStudioRunStatus = "completed" | "failed";
export type ContentStudioGenerationMode = "template_scaffold";
export type ContentStudioSourceKind = "partner_material" | "external_reference";
export type ContentStudioSourceStanding = SourceStanding;
export type ClaimComplianceStatus = "allowed" | "needs_review" | "blocked";

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

export interface ContentStudioSource {
  id: string;
  kind: ContentStudioSourceKind;
  title: string;
  url: string | null;
  suppliedText: string;
  standing: ContentStudioSourceStanding;
  policyLabel: string;
  policyNote: string | null;
  ingestedAt: string;
}

export interface ContentStudioClaim {
  id: string;
  text: string;
  sourceId: string;
  supportText: string;
  verificationStatus: VerificationStatus;
  verificationNote: string | null;
  complianceStatus: ClaimComplianceStatus;
  complianceReasons: string[];
  allowedFormats: PharmaOutputKind[];
  createdAt: string;
}

export interface ContentStudioComplianceSummary {
  allowed: number;
  needsReview: number;
  blocked: number;
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
  sources: ContentStudioSource[];
  claims: ContentStudioClaim[];
  complianceSummary: ContentStudioComplianceSummary;
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
  brand_page: "Бренд-страница",
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
  if (/регистрац|вебинар|конференц|мероприят/.test(value)) return "Регистрация на событие";
  if (/чек[- ]?лист|шпаргал|сохран|алгоритм/.test(value)) return "Практическое использование и сохранение";
  if (/исследован|стат(ья|ью|ьи)|обзор|материал/.test(value)) return "Ознакомление с материалом";
  return "Уточнить целевое действие";
}

function audienceForSpecialty(specialty: SpecialtyId): string {
  return specialty === "cardiology" ? "Кардиологи" : "Онкологи";
}

function scaffold(kind: PharmaOutputKind, brief: ContentStudioBrief): string {
  const shared = `Задача\n${brief.rawText}\n\nАудитория\n${brief.audience}\n\nЦель\n${brief.campaignGoal}`;
  switch (kind) {
    case "article":
      return `${shared}\n\nСтруктура статьи\n1. Коротко о главном: выводы в начале.\n2. Клинический контекст.\n3. Утверждения — только после проверки по источникам.\n4. Первичные источники.\n5. Маркировка партнёрского материала.\n\nМедицинские утверждения на этом шаге не пишутся.`;
    case "useful":
      return `${shared}\n\nФормат\nЧек-лист, инфографика, подборка или карточки на одну страницу. Каждый медицинский тезис связан с проверенным источником до публикации. Интерес измеряется скачиваниями, сохранениями и просмотрами.`;
    case "media":
      return `${shared}\n\nФормат\nВидео, подкаст или рассказ врача: вступление → 3–5 тезисов из проверенных источников → источник → призыв к действию. Тезисы появятся после проверки утверждений.`;
    case "event":
      return `${shared}\n\nФормат\nАнонс события: что получит врач → дата и формат → спикеры → программа → регистрация внутри сервиса → напоминания. Даты и спикеры берутся только из исходных материалов.`;
    case "brand_page":
      return `${shared}\n\nФормат\nСтраница компании для врачей: о компании → материалы → события → медицинский отдел → сообщение о нежелательной реакции. Реквизиты берутся только из исходных материалов.`;
  }
}

export function summarizeCompliance(claims: readonly ContentStudioClaim[]): ContentStudioComplianceSummary {
  return {
    allowed: claims.filter(claim => claim.complianceStatus === "allowed").length,
    needsReview: claims.filter(claim => claim.complianceStatus === "needs_review").length,
    blocked: claims.filter(claim => claim.complianceStatus === "blocked").length,
  };
}

export function normalizeContentStudioPackage(pkg: ContentStudioPackage): ContentStudioPackage {
  const sources = Array.isArray(pkg.sources) ? pkg.sources : [];
  const claims = Array.isArray(pkg.claims) ? pkg.claims : [];
  return { ...pkg, sources, claims, complianceSummary: summarizeCompliance(claims) };
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
    disclosure: "Партнёрский материал",
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
      note: "Созданы заготовки форматов. Медицинские утверждения появятся после проверки источников.",
    },
    sources: [],
    claims: [],
    complianceSummary: { allowed: 0, needsReview: 0, blocked: 0 },
    drafts,
    status: "draft",
    reviewRequestedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function addSourceEvidence(
  pkg: ContentStudioPackage,
  source: ContentStudioSource,
  claims: readonly ContentStudioClaim[],
  now = new Date().toISOString(),
): ContentStudioPackage {
  if (pkg.status !== "draft") throw new Error("package_not_editable");
  const nextClaims = [...pkg.claims, ...claims];
  return {
    ...pkg,
    sources: [...pkg.sources, source],
    claims: nextClaims,
    complianceSummary: summarizeCompliance(nextClaims),
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
  if (!pkg.sources.length) throw new Error("source_required");
  if (!pkg.claims.length) throw new Error("claim_map_required");
  return {
    ...pkg,
    status: "in_review",
    reviewRequestedAt: now,
    updatedAt: now,
    drafts: pkg.drafts.map(draft => ({ ...draft, status: "in_review", updatedAt: now })),
  };
}
