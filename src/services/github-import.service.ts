import { env } from "../config/env";
import type { IProjectFile } from "../models/project.model";
import { ApiError } from "../utils/ApiError";
import { detectLanguage } from "./lint/language";

const GITHUB_API = "https://api.github.com";
const GITHUB_RAW = "https://raw.githubusercontent.com";

// Limits are aligned with the project model and validator
const MAX_FILES = 20;
const MAX_FILE_BYTES = 100_000;
const MAX_PATH_LENGTH = 200;
const MAX_TOTAL_BYTES = 500_000;
const REQUEST_TIMEOUT_MS = 15_000;

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  "target",
  "bin",
  "obj",
  "__pycache__",
  ".git",
  ".next",
  ".nuxt",
  ".venv",
  "venv",
]);

interface TreeEntry {
  path: string;
  type: "blob" | "tree" | "commit";
  size?: number;
}

export interface GithubImportResult {
  repoUrl: string;
  files: IProjectFile[];
  skipped: number;
}

function parseRepoUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw ApiError.badRequest("Invalid repository URL");
  }

  if (!["github.com", "www.github.com"].includes(url.hostname))
    throw ApiError.badRequest("Only github.com repositories are supported");

  const [owner, rawRepo] = url.pathname.split("/").filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/i, "");

  const valid = /^[\w.-]+$/;
  if (!owner || !repo || !valid.test(owner) || !valid.test(repo))
    throw ApiError.badRequest(
      "Use a URL like https://github.com/owner/repository",
    );

  return { owner, repo };
}

function apiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ai-code-review",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return headers;
}

async function githubGet<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${GITHUB_API}${path}`, {
      headers: apiHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw ApiError.badGateway("Could not reach GitHub, try again later");
  }

  if (res.ok) return (await res.json()) as T;

  if (res.status === 404 || res.status === 451)
    throw ApiError.notFound("Repository not found or it is private");

  if (
    (res.status === 403 || res.status === 429) &&
    res.headers.get("x-ratelimit-remaining") === "0"
  )
    throw ApiError.badGateway("GitHub rate limit reached, try again later");

  if (res.status === 401)
    throw ApiError.badGateway(
      "GitHub rejected the server token. Check GITHUB_TOKEN",
    );

  throw ApiError.badGateway(`GitHub request failed (${res.status})`);
}

const encodePath = (p: string) =>
  p.split("/").map(encodeURIComponent).join("/");

function isImportable(entry: TreeEntry): boolean {
  if (entry.type !== "blob") return false;
  if (!entry.size || entry.size > MAX_FILE_BYTES) return false;
  if (entry.path.length > MAX_PATH_LENGTH) return false;

  const segments = entry.path.split("/");
  if (segments.slice(0, -1).some((s) => IGNORED_DIRS.has(s))) return false;

  const name = segments[segments.length - 1].toLowerCase();
  if (name.endsWith(".d.ts") || name.includes(".min.")) return false;

  return detectLanguage(name) !== "unknown";
}

async function fetchFileContent(
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${GITHUB_RAW}/${owner}/${repo}/${encodePath(branch)}/${encodePath(filePath)}`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
    if (!res.ok) return null;

    const text = await res.text();
    // skip empty and binary-looking files
    if (!text.trim() || text.includes("\u0000")) return null;
    return text;
  } catch {
    return null;
  }
}

export async function fetchGithubRepoFiles(
  repoUrl: string,
): Promise<GithubImportResult> {
  const { owner, repo } = parseRepoUrl(repoUrl);

  const meta = await githubGet<{ default_branch: string }>(
    `/repos/${owner}/${repo}`,
  );
  const branch = meta.default_branch;

  const tree = await githubGet<{ tree: TreeEntry[] }>(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );

  const candidates = tree.tree
    .filter(isImportable)
    // shallow files first (entry points and src files, not deep fixtures)
    .sort((a, b) => {
      const depth = a.path.split("/").length - b.path.split("/").length;
      return depth !== 0 ? depth : a.path.localeCompare(b.path);
    });

  const selected: TreeEntry[] = [];
  let totalBytes = 0;
  for (const entry of candidates) {
    if (selected.length >= MAX_FILES) break;
    if (totalBytes + (entry.size ?? 0) > MAX_TOTAL_BYTES) continue;
    selected.push(entry);
    totalBytes += entry.size ?? 0;
  }

  if (selected.length === 0)
    throw ApiError.badRequest(
      "No supported source files found in this repository",
    );

  const contents = await Promise.all(
    selected.map((e) => fetchFileContent(owner, repo, branch, e.path)),
  );

  const files: IProjectFile[] = [];
  selected.forEach((entry, i) => {
    const content = contents[i];
    if (content === null || content.length > MAX_FILE_BYTES) return;
    files.push({
      path: entry.path,
      language: detectLanguage(entry.path),
      content,
    });
  });

  if (files.length === 0)
    throw ApiError.badRequest("Could not read any files from this repository");

  return {
    repoUrl: `https://github.com/${owner}/${repo}`,
    files,
    skipped: candidates.length - files.length,
  };
}
