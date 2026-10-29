import path from "node:path";

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".py": "python",
  ".java": "java",
  ".go": "go",
  ".rb": "ruby",
  ".php": "php",
  ".c": "c",
  ".cpp": "cpp",
  ".cs": "csharp",
  ".rs": "rust",
};

export function detectLanguage(filename: string): string {
  return (
    EXTENSION_TO_LANGUAGE[path.extname(filename).toLowerCase()] ?? "unknown"
  );
}
