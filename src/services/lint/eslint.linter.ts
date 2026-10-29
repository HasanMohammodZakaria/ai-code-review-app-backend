import { ESLint } from "eslint";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import type { Linter, LintFinding } from "./lint.types";

import type { LintSeverity } from "./lint.types";

const HIGH_RULES = new Set([
  "parse-error",
  "no-undef",
  "no-unreachable",
  "no-dupe-keys",
  "no-const-assign",
  "no-func-assign",
  "no-cond-assign",
  "use-isnan",
  "valid-typeof",
  "no-self-assign",
  "no-redeclare",
]);

const LOW_RULES = new Set([
  "prefer-const",
  "no-var",
  "no-empty",
  "no-extra-semi",
  "@typescript-eslint/no-explicit-any",
]);

function mapSeverity(rule: string): LintSeverity {
  if (HIGH_RULES.has(rule)) return "high";
  if (LOW_RULES.has(rule)) return "low";
  return "medium"; // e.g. no-unused-vars
}

// Flat config built in code: no config files on disk are read
const eslint = new ESLint({
  overrideConfigFile: true,
  warnIgnored: false,
  overrideConfig: [
    {
      files: ["**/*.{js,jsx,mjs,cjs}"],
      ...js.configs.recommended,
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
    },
    ...tseslint.configs.recommended.map((config) => ({
      ...config,
      files: ["**/*.{ts,tsx}"],
    })),
  ],
});

export const eslintLinter: Linter = {
  name: "eslint",
  languages: ["javascript", "typescript"],

  async run(code, filename): Promise<LintFinding[]> {
    // The code is only parsed, never executed
    const [result] = await eslint.lintText(code, { filePath: filename });
    if (!result) return [];

    return result.messages.map((m) => {
      const rule = m.fatal ? "parse-error" : (m.ruleId ?? "unknown");
      return {
        line: m.line ?? 1,
        column: m.column,
        severity: mapSeverity(rule),
        rule,
        message: m.message,
      };
    });
  },
};
