import fs from "node:fs";
import path from "node:path";
import { decideRelease } from "./lib/decision";
import { validateExperienceContract } from "./lib/experience";
import { classifyRisk } from "./lib/risk";
import type { ChangeContract, CohortMetrics, GateResult } from "./lib/model";

interface EvidenceInput {
  gates?: GateResult[];
  metrics?: CohortMetrics;
}

function arg(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1]!;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing --${name}`);
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function writeJson(dir: string, name: string, value: unknown) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function changedFiles(file: string): string[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/u).map(item => item.trim()).filter(Boolean);
}

function experienceGate(contract: ChangeContract, candidateSha: string, required: boolean): GateResult | null {
  const validation = validateExperienceContract(contract);
  if (!required && !contract.experience_contract) return null;
  if (required && !contract.experience_contract) {
    return {
      gate: "experience_contract",
      status: "FAIL",
      candidate_sha: candidateSha,
      source: "control-plane/experience-validator",
      summary: "User-visible change requires an explicit experience_contract",
    };
  }
  return {
    gate: "experience_contract",
    status: validation.valid ? "PASS" : "FAIL",
    candidate_sha: candidateSha,
    source: "control-plane/experience-validator",
    summary: validation.valid
      ? `valid${validation.warnings.length ? `; warnings: ${validation.warnings.join(" | ")}` : ""}`
      : validation.errors.join(" | "),
  };
}

const contractPath = arg("contract");
const changedFilesPath = arg("changed-files");
const candidateSha = arg("candidate-sha");
const baselineSha = arg("baseline-sha");
const outDir = arg("out", "control-plane-output");
const evidencePath = arg("evidence", "");

const contract = readJson<ChangeContract>(contractPath);
const files = changedFiles(changedFilesPath);
const evidence: EvidenceInput = evidencePath && fs.existsSync(evidencePath) ? readJson<EvidenceInput>(evidencePath) : {};
const assessment = classifyRisk({ contract, changedFiles: files, candidateSha, baselineSha });
const gates = [...(evidence.gates ?? [])];
const expGate = experienceGate(contract, candidateSha, assessment.required_gates.includes("experience_contract"));
if (expGate) gates.push(expGate);

const decision = decideRelease({ assessment, gates, metrics: evidence.metrics });

writeJson(outDir, "change_contract.json", contract);
writeJson(outDir, "risk_assessment.json", assessment);
writeJson(outDir, "gate_results.json", gates);
writeJson(outDir, "release_decision.json", decision);
fs.writeFileSync(path.join(outDir, "candidate_sha.txt"), `${candidateSha}\n`, "utf8");
fs.writeFileSync(path.join(outDir, "baseline_sha.txt"), `${baselineSha}\n`, "utf8");

const summary = [
  `# Control Plane shadow decision`,
  ``,
  `- Change: ${contract.change_id} — ${contract.title}`,
  `- Candidate: ${candidateSha}`,
  `- Baseline: ${baselineSha}`,
  `- Engineering risk: ${assessment.risk_class}`,
  `- Experience impact: ${assessment.experience_impact}`,
  `- Decision: ${decision.status}`,
  `- Eligible rollout: ${decision.eligible_rollout_percent}%`,
  ``,
  `## Required gates`,
  ...assessment.required_gates.map(gate => `- ${gate}`),
  ``,
  `## Why`,
  ...decision.reasons.map(reason => `- ${reason}`),
  ``,
].join("\n");
fs.writeFileSync(path.join(outDir, "human_readable_summary.md"), summary, "utf8");

console.log(JSON.stringify(decision, null, 2));
