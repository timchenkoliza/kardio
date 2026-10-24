import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AGENT_IDS } from "@/lib/agents/types";
import { CAPABILITIES, CAPABILITY_STATUSES, DOCUMENT_CONFLICTS, SOURCE_ROW_RANGE, SOURCE_ROWS } from "@/lib/capabilities/coverage";
import { renderCoverageMatrix } from "@/lib/capabilities/render";

/**
 * The traceability table is a contract: every row of the physician scenario
 * matrix is traced to a capability, every capability names real code and real
 * tests, and the status rules hold. Coverage is checked by source row, not by
 * agent or page names.
 */

describe("capability coverage registry", () => {
  it("traces every source row (2–57) exactly once, in order", () => {
    const rows = SOURCE_ROWS.map(row => row.row);
    const expected = Array.from({ length: SOURCE_ROW_RANGE.last - SOURCE_ROW_RANGE.first + 1 }, (_, index) => SOURCE_ROW_RANGE.first + index);
    expect(rows).toEqual(expected);
  });

  it("every row points at existing capabilities, and every capability is reached by a row", () => {
    const ids = new Set(CAPABILITIES.map(capability => capability.id));
    expect(ids.size).toBe(CAPABILITIES.length);
    for (const row of SOURCE_ROWS) {
      expect(row.capabilities.length, `row ${row.row}`).toBeGreaterThan(0);
      for (const id of row.capabilities) expect(ids.has(id), `row ${row.row} → ${id}`).toBe(true);
    }
    const reached = new Set(SOURCE_ROWS.flatMap(row => row.capabilities));
    for (const capability of CAPABILITIES) expect(reached.has(capability.id), capability.id).toBe(true);
  });

  it("all 29 numbered scenarios (rows 29–57) are their own capabilities, not merged away", () => {
    const numbered = SOURCE_ROWS.filter(row => row.row >= 29);
    expect(numbered).toHaveLength(29);
    for (const row of numbered) expect(row.disposition, `row ${row.row}`).toBe("implemented");
    const scenarios = new Set(CAPABILITIES.map(capability => capability.scenario).filter(Boolean));
    for (const code of ["A1", "A2", "A3", "A4", ...Array.from({ length: 15 }, (_, index) => `B${index + 1}`), "C1", "D1", "D2", "D3", "E1", "E2", "E3", "F1", "F2", "F3"]) expect(scenarios.has(code), code).toBe(true);
  });

  it("names real code and real tests for every capability", () => {
    for (const capability of CAPABILITIES) {
      expect(capability.tests.length, capability.id).toBeGreaterThan(0);
      for (const file of [...capability.code, ...capability.tests]) expect(existsSync(file), `${capability.id}: ${file}`).toBe(true);
    }
  });

  it("status rules: UNAVAILABLE names its blocker, PARTIAL names what is missing, LIVE claims no gap", () => {
    for (const capability of CAPABILITIES) {
      expect(CAPABILITY_STATUSES).toContain(capability.status);
      expect(CAPABILITY_STATUSES).toContain(capability.statusBefore);
      if (capability.status === "UNAVAILABLE") expect(capability.blockers.length, capability.id).toBeGreaterThan(0);
      if (capability.status === "PARTIAL") expect(capability.gaps.length + capability.blockers.length, capability.id).toBeGreaterThan(0);
      if (capability.status === "LIVE") {
        expect(capability.entry.filter(entry => entry !== "—").length, capability.id).toBeGreaterThan(0);
        // A physician-facing LIVE capability runs on real data, not on a link or nothing.
        if (capability.agent !== "platform") expect(["none", "handoff"], capability.id).not.toContain(capability.depth);
      }
      // A capability is never MOCK silently: MOCK must say it is synthetic.
      if (capability.status === "MOCK") expect(capability.outcome + capability.gaps.join(" "), capability.id).toMatch(/синтетич|демонстрац/u);
      if (capability.agent !== "platform") expect(AGENT_IDS).toContain(capability.agent);
    }
  });

  it("documents every conflict between the task documents with a decision", () => {
    expect(DOCUMENT_CONFLICTS.length).toBeGreaterThan(0);
    for (const conflict of DOCUMENT_CONFLICTS) expect(conflict.decision.length, conflict.id).toBeGreaterThan(20);
  });

  it("the rendered matrix in docs/ is up to date", () => {
    expect(readFileSync("docs/CAPABILITY_COVERAGE_MATRIX.md", "utf8")).toBe(renderCoverageMatrix());
  });
});
