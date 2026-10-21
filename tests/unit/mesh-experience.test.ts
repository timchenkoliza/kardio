import { beforeEach, describe, expect, it } from "vitest";
import { compileExperience, safeManifest, type CompileInput } from "@/lib/mesh/compiler";
import { experienceManifestSchema, MODULE_POLICY, type ExperienceManifest } from "@/lib/mesh/manifest";
import { validateManifest } from "@/lib/mesh/policies";
import { resetBrowserToolState } from "@/server/mesh/browser/tool";
import { descriptors } from "@/server/mesh/sources/registry";
import { acceptanceGraph } from "./mesh-test-utils";

beforeEach(() => resetBrowserToolState());

async function compiled() {
  const { graph, intent, registry } = await acceptanceGraph();
  const input: CompileInput = { graph, user: { signals: ["specialty"], topics: [] }, modules: intent.modules, policy: { descriptors: descriptors(registry) }, scenario: intent.context.scenario };
  return { graph, intent, input, output: compileExperience(input) };
}

function clone(manifest: ExperienceManifest): ExperienceManifest {
  return JSON.parse(JSON.stringify(manifest)) as ExperienceManifest;
}

describe("Experience Compiler — bounded, deterministic, evidence-bound", () => {
  it("compiles the acceptance graph into a schema-valid guideline-delta manifest that passes every policy", async () => {
    const { output } = await compiled();
    expect(output.fallback).toBe(false);
    expect(output.report.blocking).toBe(0);
    expect(experienceManifestSchema.safeParse(output.manifest).success).toBe(true);
    const families = output.manifest.modules.map(entry => entry.family);
    expect(families[0]).toBe("key_takeaway");
    expect(families).toEqual(expect.arrayContaining(["recommendation_delta", "conflict", "drug_reference", "evidence", "sources", "handoff"]));
    expect(families.at(-1)).toBe("next_actions");
    expect(output.manifest.representation.mode).toBe("guideline_delta");
    expect(output.manifest.intent).toMatchObject({ job: "guideline_check", family: "guidelines", nosology: "cardiology/heart_failure", subtype: "cardiology/heart_failure/hfpef" });
    for (const entry of output.manifest.modules) expect(MODULE_POLICY[entry.family].implemented).toBe(true);
    expect(output.manifest.actions.map(action => action.kind)).toEqual(expect.arrayContaining(["open_source", "verify_official", "investigate_deeper"]));
  });

  it("is deterministic: same graph, same manifest", async () => {
    const first = await compiled();
    resetBrowserToolState();
    const second = await compiled();
    expect(second.output.manifest).toEqual(first.output.manifest);
  });

  it("modules carry graph ids, never their own medical text", async () => {
    const { output, graph } = await compiled();
    const claims = new Set(graph.claims.map(claim => claim.id));
    for (const entry of output.manifest.modules) {
      for (const id of entry.claimIds) expect(claims.has(id)).toBe(true);
      for (const value of Object.values(entry.props)) if (typeof value === "string") expect(value.length).toBeLessThan(40);
    }
    const takeaway = output.manifest.modules[0];
    const kinds = takeaway.claimIds.map(id => graph.claims.find(claim => claim.id === id)!.kind);
    expect(kinds).toEqual(expect.arrayContaining(["guideline_metadata", "currentness", "guideline_statement"]));
  });

  it("the physician's real signals only: no personalisation is claimed without them", async () => {
    const { output } = await compiled();
    expect(output.manifest.personalization).toEqual({ applied: false, source: "default", signals: ["specialty"] });
  });

  it("the caller cannot break the stable order: the compiler enforces it", async () => {
    const { input } = await compiled();
    const reordered = compileExperience({ ...input, modules: ["evidence", "key_takeaway"] });
    expect(reordered.fallback).toBe(false);
    expect(reordered.manifest.modules[0].family).toBe("key_takeaway");
  });

  it("falls back to a safe answer when the candidate breaks a blocking policy — and the fallback is itself valid", async () => {
    const { graph, input } = await compiled();
    // A stricter source policy (e.g. a publisher limits excerpts) blocks the normal candidate.
    const strict = { descriptors: input.policy.descriptors.map(descriptor => (descriptor.id === "medi" ? { ...descriptor, usagePolicy: { ...descriptor.usagePolicy, maxExcerptChars: 20 } } : descriptor)) };
    const output = compileExperience({ ...input, policy: strict });
    expect(output.fallback).toBe(true);
    expect(output.rejected?.findings.some(item => item.rule === "SP-03-excerpt-limit")).toBe(true);
    expect(output.manifest.representation.mode).toBe("safe_answer");
    expect(output.manifest.compiler.fallback).toBe(true);
    expect(experienceManifestSchema.safeParse(output.manifest).success).toBe(true);
    expect(output.report.blocking).toBe(0);
    const shown = new Set(output.manifest.modules.flatMap(entry => entry.documentIds));
    // The instruction and guideline whose excerpts break the stricter policy are withheld, and the reader is told so.
    expect(shown.has("medi:/instrukciya/dzhardins_6916/")).toBe(false);
    expect(shown.has("medi:/klinicheskie-rekomendatsii/khronicheskaya-serdechnaya-nedostatochnost_14015/")).toBe(false);
    expect(JSON.stringify(output.manifest.modules.map(entry => entry.props))).toMatch(/условия использования источника/u);
    expect(validateManifest(safeManifest(graph, input, "test"), graph, input.policy).blocking).toBe(0);
  });
});

describe("Policy validators — executable gates with fix suggestions, never mutations", () => {
  it("EvidencePolicy rejects invented claims and hidden conflicts", async () => {
    const { output, graph, input } = await compiled();
    const tampered = clone(output.manifest);
    tampered.modules[0].claimIds.push("claim:invented");
    tampered.modules = tampered.modules.filter(entry => entry.family !== "conflict");
    const report = validateManifest(tampered, graph, input.policy);
    const rules = report.findings.map(item => item.rule);
    expect(rules).toContain("EV-02-no-invented-claims");
    expect(rules).toContain("EV-05-preserve-conflicts");
    expect(report.findings.find(item => item.rule === "EV-05-preserve-conflicts")?.fix).toMatchObject({ kind: "add_module", changeCause: "experience_delta" });
    // Validation never edits the manifest it was given.
    expect(tampered.modules[0].claimIds.at(-1)).toBe("claim:invented");
  });

  it("DesignSystemPolicy and EditorialPolicy reject unapproved families, titles and implementation vocabulary", async () => {
    const { output, graph, input } = await compiled();
    const tampered = clone(output.manifest);
    tampered.modules.push({ ...tampered.modules[0], id: "calc", family: "calculator", title: "Калькулятор" });
    tampered.modules[1].title = "Ответ агента";
    tampered.actions[0].label = "назначьте препарат";
    const rules = validateManifest(tampered, graph, input.policy).findings.map(item => item.rule);
    expect(rules).toEqual(expect.arrayContaining(["DS-01-approved-family", "DS-05-approved-title", "ED-01-no-implementation-vocabulary", "ED-03-no-directive-wording"]));
  });

  it("ExperiencePolicy keeps the stable order and makes currentness visible", async () => {
    const { output, graph, input } = await compiled();
    const tampered = clone(output.manifest);
    tampered.modules.reverse();
    const currentness = graph.claims.find(claim => claim.kind === "currentness")!;
    for (const entry of tampered.modules) entry.claimIds = entry.claimIds.filter(id => id !== currentness.id);
    const rules = validateManifest(tampered, graph, input.policy).findings.map(item => item.rule);
    expect(rules).toEqual(expect.arrayContaining(["EX-01-takeaway-first", "EX-06-currentness-visible"]));
  });

  it("SourcePolicy enforces excerpt limits, specialty boundaries and a visible list of the sources used", async () => {
    const { output, graph, input } = await compiled();
    const tampered = clone(output.manifest);
    for (const entry of tampered.modules) if (entry.family === "sources") entry.props.sourceIds = [];
    const longGraph = { ...graph, specialty: "therapy" as const, claims: graph.claims.map(claim => (claim.documentId.startsWith("medi:") ? { ...claim, quote: "x".repeat(900) } : claim)) };
    const rules = validateManifest(tampered, longGraph, input.policy).findings.map(item => item.rule);
    expect(rules).toEqual(expect.arrayContaining(["SP-01-show-sources-used", "SP-03-excerpt-limit", "SP-04-specialty-boundary"]));
  });
});
