import "server-only";

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import {
  ACCESS_SUBJECTS,
  DEFAULT_AGENT_ACCESS_POLICY,
  WORKSPACE_ROLES,
  applyAgentAccessOverrides,
  type AccessSubject,
  type AccessSubjectId,
  type AgentAccessOverride,
  type AgentAccessPolicy,
  type WorkspaceRole,
} from "@/lib/access/agent-entitlements";

export const DEMO_ACCESS_SUBJECT_COOKIE = "b2d_demo_access_subject";
export const DEMO_ACCESS_OVERRIDES_COOKIE = "b2d_demo_agent_overrides";

const SUBJECT_IDS = new Set<string>(ACCESS_SUBJECTS.map(subject => subject.id));
const ROLES = new Set<string>(WORKSPACE_ROLES);

export interface RequestAccessState {
  subject: AccessSubject;
  policy: AgentAccessPolicy;
  overrides: AgentAccessOverride[];
  source: "default" | "preview_override";
  previewMutable: boolean;
}

/**
 * Preview-only admin editing. Production must replace this with trusted identity
 * and persisted ACL data. Cookie values are ignored in production.
 */
export function previewAccessAdminEnabled(): boolean {
  return process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "development" || process.env.B2D_ACCESS_ADMIN_DEMO === "1";
}

function defaultSubject(): AccessSubject {
  return ACCESS_SUBJECTS.find(subject => subject.id === "physician_demo") ?? ACCESS_SUBJECTS[0];
}

function parseSubject(value: string | undefined | null): AccessSubject {
  if (!value || !SUBJECT_IDS.has(value)) return defaultSubject();
  return ACCESS_SUBJECTS.find(subject => subject.id === value) ?? defaultSubject();
}

function decodeOverrides(value: string | undefined | null): AgentAccessOverride[] {
  if (!value || !previewAccessAdminEnabled()) return [];
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(item => item && typeof item === "object")
      .filter(item => SUBJECT_IDS.has(String(item.subjectId)))
      .filter(item => typeof item.agentId === "string" && typeof item.enabled === "boolean")
      .slice(0, 48)
      .map(item => ({ subjectId: String(item.subjectId) as AccessSubjectId, agentId: item.agentId, enabled: item.enabled } as AgentAccessOverride));
  } catch {
    return [];
  }
}

export function encodeOverrides(overrides: readonly AgentAccessOverride[]): string {
  return Buffer.from(JSON.stringify(overrides.slice(0, 48)), "utf8").toString("base64url");
}

function stateFromValues(subjectValue: string | undefined | null, overridesValue: string | undefined | null): RequestAccessState {
  const mutable = previewAccessAdminEnabled();
  const subject = mutable ? parseSubject(subjectValue) : defaultSubject();
  const overrides = mutable ? decodeOverrides(overridesValue) : [];
  const policy = applyAgentAccessOverrides(DEFAULT_AGENT_ACCESS_POLICY, overrides);
  return { subject, policy, overrides, source: overrides.length || (mutable && subject.id !== "physician_demo") ? "preview_override" : "default", previewMutable: mutable };
}

export async function getRequestAccessState(): Promise<RequestAccessState> {
  const jar = await cookies();
  return stateFromValues(jar.get(DEMO_ACCESS_SUBJECT_COOKIE)?.value, jar.get(DEMO_ACCESS_OVERRIDES_COOKIE)?.value);
}

export function getRequestAccessStateFromRequest(request: NextRequest): RequestAccessState {
  return stateFromValues(request.cookies.get(DEMO_ACCESS_SUBJECT_COOKIE)?.value, request.cookies.get(DEMO_ACCESS_OVERRIDES_COOKIE)?.value);
}

export function normalizeWorkspaceRole(value: unknown): WorkspaceRole | null {
  return typeof value === "string" && ROLES.has(value) ? value as WorkspaceRole : null;
}
