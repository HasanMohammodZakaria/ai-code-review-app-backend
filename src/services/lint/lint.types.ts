export type LintSeverity = "high" | "medium" | "low";

export interface LintFinding {
  line: number;
  column?: number;
  severity: LintSeverity;
  rule: string; // e.g. "no-unused-vars"
  message: string;
}

// Every language linter implements this interface
export interface Linter {
  name: string; // "eslint", "ruff", ...
  languages: string[]; // ["javascript", "typescript"]
  run(code: string, filename: string): Promise<LintFinding[]>;
}

export interface LintResult {
  language: string;
  available: boolean; // false = no linter registered for this language
  linter?: string;
  findings: LintFinding[];
  error?: string; // linter crashed; the review can continue without it
}
