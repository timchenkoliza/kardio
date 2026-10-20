import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGENT_ACCESS_POLICY,
  applyAgentAccessOverrides,
  canUseAgentCapability,
  visibleAgentsForSubject,
} from "@/lib/access/agent-entitlements";

describe("agent access policy", () => {
  it("separates physician and pharma agent catalogues", () => {
    expect(visibleAgentsForSubject(DEFAULT_AGENT_ACCESS_POLICY, "physician_demo", "physician_workspace")).toContain("research");
    expect(visibleAgentsForSubject(DEFAULT_AGENT_ACCESS_POLICY, "physician_demo", "partner_workspace")).not.toContain("content_studio");
    expect(visibleAgentsForSubject(DEFAULT_AGENT_ACCESS_POLICY, "pharma_demo", "partner_workspace")).toEqual(["content_studio"]);
    expect(visibleAgentsForSubject(DEFAULT_AGENT_ACCESS_POLICY, "pharma_demo", "physician_workspace")).toEqual([]);
  });

  it("keeps pharma publish behind editorial/admin capabilities", () => {
    expect(canUseAgentCapability(DEFAULT_AGENT_ACCESS_POLICY, "pharma_demo", "content_studio", "run")).toBe(true);
    expect(canUseAgentCapability(DEFAULT_AGENT_ACCESS_POLICY, "pharma_demo", "content_studio", "publish")).toBe(false);
    expect(canUseAgentCapability(DEFAULT_AGENT_ACCESS_POLICY, "editorial_demo", "content_studio", "publish")).toBe(true);
    expect(canUseAgentCapability(DEFAULT_AGENT_ACCESS_POLICY, "admin_demo", "content_studio", "approve")).toBe(true);
  });

  it("applies preview overrides without mutating the default policy", () => {
    const next = applyAgentAccessOverrides(DEFAULT_AGENT_ACCESS_POLICY, [{ subjectId: "pharma_demo", agentId: "content_studio", enabled: false }]);
    expect(visibleAgentsForSubject(next, "pharma_demo", "partner_workspace")).toEqual([]);
    expect(visibleAgentsForSubject(DEFAULT_AGENT_ACCESS_POLICY, "pharma_demo", "partner_workspace")).toEqual(["content_studio"]);
  });
});
