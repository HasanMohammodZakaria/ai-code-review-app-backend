import path from "node:path";
import { eslintLinter } from "./eslint.linter";
import { detectLanguage } from "./language";
import type { Linter, LintResult } from "./lint.types";

const registry = new Map<string, Linter>();

export function registerLinter(linter: Linter): void {
  for (const language of linter.languages) registry.set(language, linter);
}

// Add a new language: write a Linter file and register it here
registerLinter(eslintLinter);
// registerLinter(ruffLinter);   // Python (later)
// registerLinter(javaLinter);   // Java (later)

export function supportedLintLanguages(): string[] {
  return [...registry.keys()];
}

export async function runLint(
  code: string,
  filename: string,
  languageOverride?: string,
): Promise<LintResult> {
  const language = languageOverride ?? detectLanguage(filename);
  const linter = registry.get(language);

  if (!linter) {
    return { language, available: false, findings: [] };
  }

  try {
    // Use only the base name so a user-supplied path can never escape the project
    const safeName = path.basename(filename);
    const findings = await linter.run(code, safeName);
    return { language, available: true, linter: linter.name, findings };
  } catch (error) {
    // A broken linter must not break the whole review
    console.error(`❌ Linter ${linter.name} failed:`, error);
    return {
      language,
      available: true,
      linter: linter.name,
      findings: [],
      error: "Linter failed to run",
    };
  }
}
