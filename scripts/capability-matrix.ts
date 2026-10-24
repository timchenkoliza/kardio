import { writeFileSync } from "node:fs";
import { renderCoverageMatrix } from "@/lib/capabilities/render";

// Regenerates docs/CAPABILITY_COVERAGE_MATRIX.md from lib/capabilities/coverage.ts.
writeFileSync("docs/CAPABILITY_COVERAGE_MATRIX.md", renderCoverageMatrix());
console.log("docs/CAPABILITY_COVERAGE_MATRIX.md written.");
