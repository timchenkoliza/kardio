import type { AgentId } from "@/lib/agents/types";

export const WORKSPACE_ROLES = ["physician", "pharma", "editorial", "admin"] as const;
export type WorkspaceRole = typeof WORKSPACE_ROLES[number];

export type PharmaAgentId = "content_studio";
export type ProductAgentId = AgentId | PharmaAgentId;
export type AgentSurface = "physician_workspace" | "partner_workspace" | "admin";
export type AccessCapability = "view" | "run" | "upload_source" | "edit_draft" | "request_review" | "approve" | "publish";

export const ACCESS_SUBJECT_IDS = ["physician_demo", "pharma_demo", "editorial_demo", "admin_demo"] as const;
export type AccessSubjectId = typeof ACCESS_SUBJECT_IDS[number];

export interface AccessSubject {
  id: AccessSubjectId;
  label: string;
  role: WorkspaceRole;
  homeSurface: AgentSurface;
}

export const ACCESS_SUBJECTS: readonly AccessSubject[] = [
  { id: "physician_demo", label: "Врач · demo", role: "physician", homeSurface: "physician_workspace" },
  { id: "pharma_demo", label: "Фарма-партнёр · demo", role: "pharma", homeSurface: "partner_workspace" },
  { id: "editorial_demo", label: "Редакция Яндекс Мед · demo", role: "editorial", homeSurface: "partner_workspace" },
  { id: "admin_demo", label: "Администратор продукта · demo", role: "admin", homeSurface: "admin" },
];

export interface AgentEntitlement {
  subjectId: AccessSubjectId;
  agentId: ProductAgentId;
  capabilities: readonly AccessCapability[];
  surface: AgentSurface;
  status: "active" | "experimental";
  enabled: boolean;
}

export interface AgentAccessPolicy {
  version: 2;
  updatedAt: string;
  entitlements: readonly AgentEntitlement[];
}

export interface AgentAccessOverride {
  subjectId: AccessSubjectId;
  agentId: ProductAgentId;
  enabled: boolean;
}

export const PHYSICIAN_AGENTS: readonly AgentId[] = [
  "whats_new",
  "guidelines",
  "drugs",
  "research",
  "events",
  "learning",
  "materials",
];

export const PRODUCT_AGENT_IDS: readonly ProductAgentId[] = [...PHYSICIAN_AGENTS, "content_studio"];

const PHYSICIAN_CAPABILITIES: readonly AccessCapability[] = ["view", "run"];
const PHARMA_STUDIO_CAPABILITIES: readonly AccessCapability[] = ["view", "run", "upload_source", "edit_draft", "request_review"];
const EDITORIAL_STUDIO_CAPABILITIES: readonly AccessCapability[] = [...PHARMA_STUDIO_CAPABILITIES, "approve", "publish"];

const physicianEntitlements: AgentEntitlement[] = PHYSICIAN_AGENTS.flatMap(agentId => [
  { subjectId: "physician_demo" as const, agentId, capabilities: PHYSICIAN_CAPABILITIES, surface: "physician_workspace" as const, status: "active" as const, enabled: true },
  { subjectId: "admin_demo" as const, agentId, capabilities: PHYSICIAN_CAPABILITIES, surface: "physician_workspace" as const, status: "active" as const, enabled: true },
]);

export const DEFAULT_AGENT_ACCESS_POLICY: AgentAccessPolicy = {
  version: 2,
  updatedAt: "2026-10-20T00:00:00.000Z",
  entitlements: [
    ...physicianEntitlements,
    { subjectId: "pharma_demo", agentId: "content_studio", capabilities: PHARMA_STUDIO_CAPABILITIES, surface: "partner_workspace", status: "experimental", enabled: true },
    { subjectId: "editorial_demo", agentId: "content_studio", capabilities: EDITORIAL_STUDIO_CAPABILITIES, surface: "partner_workspace", status: "experimental", enabled: true },
    { subjectId: "admin_demo", agentId: "content_studio", capabilities: EDITORIAL_STUDIO_CAPABILITIES, surface: "partner_workspace", status: "experimental", enabled: true },
  ],
};

/** Compatibility export for code that only needs the default catalogue. */
export const AGENT_ENTITLEMENTS = DEFAULT_AGENT_ACCESS_POLICY.entitlements;

export function entitlementForSubject(policy: AgentAccessPolicy, subjectId: AccessSubjectId, agentId: ProductAgentId): AgentEntitlement | null {
  return policy.entitlements.find(entitlement => entitlement.subjectId === subjectId && entitlement.agentId === agentId) ?? null;
}

export function canUseAgentCapability(policy: AgentAccessPolicy, subjectId: AccessSubjectId, agentId: ProductAgentId, capability: AccessCapability = "view"): boolean {
  const entitlement = entitlementForSubject(policy, subjectId, agentId);
  return Boolean(entitlement?.enabled && entitlement.capabilities.includes(capability));
}

export function visibleAgentsForSubject(policy: AgentAccessPolicy, subjectId: AccessSubjectId, surface?: AgentSurface): ProductAgentId[] {
  return policy.entitlements
    .filter(entitlement => entitlement.subjectId === subjectId && entitlement.enabled && entitlement.capabilities.includes("view"))
    .filter(entitlement => !surface || entitlement.surface === surface)
    .map(entitlement => entitlement.agentId);
}

/** Role helpers preserve the first-commit API. Server surfaces should prefer subject-scoped helpers. */
export function canAccessAgent(role: WorkspaceRole, agentId: ProductAgentId): boolean {
  return ACCESS_SUBJECTS.filter(subject => subject.role === role).some(subject => canUseAgentCapability(DEFAULT_AGENT_ACCESS_POLICY, subject.id, agentId, "view"));
}

export function visibleAgentsForRole(role: WorkspaceRole, surface?: AgentSurface): ProductAgentId[] {
  const ids = ACCESS_SUBJECTS
    .filter(subject => subject.role === role)
    .flatMap(subject => visibleAgentsForSubject(DEFAULT_AGENT_ACCESS_POLICY, subject.id, surface));
  return [...new Set(ids)];
}

export function visibleAgentsForRoleWithPolicy(policy: AgentAccessPolicy, role: WorkspaceRole, surface?: AgentSurface): ProductAgentId[] {
  const ids = ACCESS_SUBJECTS
    .filter(subject => subject.role === role)
    .flatMap(subject => visibleAgentsForSubject(policy, subject.id, surface));
  return [...new Set(ids)];
}

export function applyAgentAccessOverrides(policy: AgentAccessPolicy, overrides: readonly AgentAccessOverride[]): AgentAccessPolicy {
  if (!overrides.length) return policy;
  const byKey = new Map(overrides.map(override => [`${override.subjectId}:${override.agentId}`, override.enabled]));
  return {
    ...policy,
    updatedAt: new Date().toISOString(),
    entitlements: policy.entitlements.map(entitlement => {
      const enabled = byKey.get(`${entitlement.subjectId}:${entitlement.agentId}`);
      return enabled === undefined ? entitlement : { ...entitlement, enabled };
    }),
  };
}
