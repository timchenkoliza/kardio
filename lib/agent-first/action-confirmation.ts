import type { AgentAction } from "@/lib/agent-first/types";

const externalActionKinds = new Set<AgentAction["kind"]>([
  "open_registration",
  "calendar_write",
  "email_send",
]);

export function requiresHumanApproval(kind: AgentAction["kind"]): boolean {
  return externalActionKinds.has(kind);
}

export function withConfirmationPolicy(action: Omit<AgentAction, "requiresConfirmation">): AgentAction {
  return { ...action, requiresConfirmation: requiresHumanApproval(action.kind) };
}
