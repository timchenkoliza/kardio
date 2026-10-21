/** JSON schema the model must answer with (strict structured output). Shared Finding shape, AI-xx ids. */
export const SEMANTIC_FINDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "priority", "pages", "viewport", "fact", "quote", "selector", "rule", "fix", "check"],
        properties: {
          id: { type: "string", pattern: "^AI-\\d{2}$" },
          priority: { enum: ["P0", "P1", "P2", "P3"] },
          pages: { type: "array", items: { type: "string" } },
          viewport: { enum: ["desktop", "mobile", "both"] },
          fact: { type: "string" },
          /** Verbatim visible text the finding is about; checked by the fact filter. */
          quote: { type: "string" },
          /** A component locator taken from the page dump; checked by the fact filter. */
          selector: { type: "string" },
          rule: { type: "string" },
          fix: { type: "string" },
          check: { type: "string" },
        },
      },
    },
  },
} as const;

export interface SemanticRawFinding {
  id: string;
  priority: "P0" | "P1" | "P2" | "P3";
  pages: string[];
  viewport: "desktop" | "mobile" | "both";
  fact: string;
  quote: string;
  selector: string;
  rule: string;
  fix: string;
  check: string;
}
