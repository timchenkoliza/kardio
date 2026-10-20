import type { AgentId } from "@/lib/agents/types";

/**
 * Product-level visibility policy for agent workspaces.
 *
 * This is an entitlement model, not authentication. The current public demo is
 * anonymous, so a future identity/admin layer must resolve WorkspaceRole on the
 * server before these rules become a security boundary.
 */
export type WorkspaceRole = "physician" | "pharma" | "editorial" | "admin";
export type PharmaAgentId = "content_studio";
export type ProductAgentId = AgentId | PharmaAgentId;
export type AgentSurface = "physician_workspace" | "partner_workspace" | "admin";

export interface AgentEntitlement {
  agentId: ProductAgentId;
  roles: readonly WorkspaceRole[];
  surface: AgentSurface;
  status: "active" | "experimental";
}

const PHYSICIAN_AGENTS: readonly AgentId[] = [
  "whats_new",
  "guidelines",
  "drugs",
  "research",
  "events",
  "learning",
  "materials",
];

export const AGENT_ENTITLEMENTS: readonly AgentEntitlement[] = [
  ...PHYSICIAN_AGENTS.map(agentId => ({
    agentId,
    roles: ["physician", "admin"] as const,
    surface: "physician_workspace" as const,
    status: "active" as const,
  })),
  {
    agentId: "content_studio",
    roles: ["pharma", "editorial", "admin"] as const,
    surface: "partner_workspace",
    status: "experimental",
  },
];

export function canAccessAgent(role: WorkspaceRole, agentId: ProductAgentId): boolean {
  return AGENT_ENTITLEMENTS.some(entitlement => entitlement.agentId === agentId && entitlement.roles.includes(role));
}

export function visibleAgentsForRole(role: WorkspaceRole, surface?: AgentSurface): ProductAgentId[] {
  return AGENT_ENTITLEMENTS
    .filter(entitlement => entitlement.roles.includes(role))
    .filter(entitlement => !surface || entitlement.surface === surface)
    .map(entitlement => entitlement.agentId);
}
