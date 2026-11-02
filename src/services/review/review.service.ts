import mongoose from "mongoose";
import { Project, type IProjectFile } from "../../models/project.model";
import {
  Review,
  type Category,
  type IIssue,
  type ReviewMode,
  type Severity,
} from "../../models/review.model";
import type { UserRole } from "../../models/user.model";
import { ApiError } from "../../utils/ApiError";
import { completeWithFallback } from "../llm/llm.manager";
import { AllProvidersFailedError, type LlmResponse } from "../llm/llm.types";
import { runLint } from "../lint/lint.registry";
import {
  buildMessages,
  MAX_TOTAL_CHARS,
  parseLlmJson,
  type LintItem,
  type LintReview,
  type ParsedReview,
} from "./review.prompt";

interface Actor {
  id: string;
  role: UserRole;
}

const PENALTY: Record<Severity, number> = { high: 10, medium: 4, low: 1 };

function categoryFor(severity: Severity): Category {
  return severity === "high"
    ? "bug"
    : severity === "medium"
      ? "improvement"
      : "style";
}

function calcScore(issues: IIssue[]): number {
  const penalty = issues.reduce((sum, i) => sum + PENALTY[i.severity], 0);
  return Math.max(0, 100 - penalty);
}

export async function createReview(actor: Actor, projectId: string) {
  if (!mongoose.isValidObjectId(projectId))
    throw ApiError.notFound("Project not found");

  const project = await Project.findById(projectId);
  const isOwner = project?.owner.toString() === actor.id;
  if (!project || (!isOwner && actor.role !== "teacher")) {
    throw ApiError.notFound("Project not found");
  }
  if (!isOwner) throw ApiError.forbidden("Only the owner can request a review");

  // 1) Pick files that fit the size budget
  const selected: IProjectFile[] = [];
  const skipped: string[] = [];
  let used = 0;
  for (const f of project.files) {
    if (used + f.content.length > MAX_TOTAL_CHARS) {
      skipped.push(f.path);
    } else {
      selected.push(f);
      used += f.content.length;
    }
  }
  if (selected.length === 0) {
    throw ApiError.badRequest(
      `Code is too large to review (max ${MAX_TOTAL_CHARS} characters in total)`,
    );
  }

  // 2) Lint every file that has a linter
  const lintItems: LintItem[] = [];
  const unlinted = new Set<string>();
  let lintedAny = false;
  for (const f of selected) {
    const result = await runLint(f.content, f.path, f.language);
    if (!result.available) {
      unlinted.add(result.language);
      continue;
    }
    lintedAny = true;
    for (const finding of result.findings) {
      lintItems.push({
        ...finding,
        id: `L${lintItems.length + 1}`,
        file: f.path,
      });
    }
  }

  // 3) Ask the LLM chain (one retry when the JSON is unusable)
  let parsed: ParsedReview | null = null;
  let answered: LlmResponse | null = null;
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    try {
      const res = await completeWithFallback({
        messages: buildMessages(selected, lintItems),
      });
      parsed = parseLlmJson(res.text);
      if (parsed) answered = res;
      else
        console.warn(
          `⚠️ ${res.provider} returned unusable JSON (attempt ${attempt + 1})`,
        );
    } catch (error) {
      if (error instanceof AllProvidersFailedError) break;
      throw error;
    }
  }

  let reviewMode: ReviewMode;
  if (parsed) reviewMode = lintedAny ? "ai+lint" : "ai-only";
  else if (lintedAny) reviewMode = "lint-only";
  else
    throw new ApiError(
      503,
      "AI review is unavailable and no linter exists for these languages",
    );

  // 4) Merge: lint findings (validated by the LLM) + the LLM's own issues
  const issues: IIssue[] = [];
  const reviewById = new Map<string, LintReview>(
    (parsed?.lintReview ?? []).map((r) => [r.id, r] as const),
  );

  for (const item of lintItems) {
    const r = reviewById.get(item.id);
    if (parsed && r && !r.valid) continue; // LLM says it is a false positive
    issues.push({
      file: item.file,
      line: item.line,
      severity: item.severity,
      category: categoryFor(item.severity),
      message: item.message,
      rule: item.rule,
      explanation: r?.explanation,
      suggestedFix: r?.suggestedFix,
      source: r ? "lint+llm" : "lint",
    });
  }

  // Drop hallucinated issues: the file and the line must really exist
  const lineCount = new Map<string, number>(
    selected.map((f) => [f.path, f.content.split("\n").length] as const),
  );
  for (const i of parsed?.issues ?? []) {
    const max = lineCount.get(i.file);
    if (max === undefined || i.line < 1 || i.line > max) continue;
    issues.push({ ...i, source: "llm" });
  }

  const issueCounts = { high: 0, medium: 0, low: 0 };
  for (const i of issues) issueCounts[i.severity]++;

  const summary =
    parsed?.summary ||
    "AI review was unavailable. This report contains lint findings only.";

  return Review.create({
    project: project._id,
    requestedBy: actor.id,
    reviewMode,
    provider: answered?.provider,
    model: answered?.model,
    summary,
    qualityScore: calcScore(issues),
    issueCounts,
    filesReviewed: selected.length,
    filesSkipped: skipped,
    unlintedLanguages: [...unlinted],
    issues,
  });
}

// Score history: newest first, without the heavy issues array
export async function listReviews(actor: Actor, projectId: string) {
  if (!mongoose.isValidObjectId(projectId))
    throw ApiError.notFound("Project not found");

  const project = await Project.findById(projectId).select("owner");
  if (
    !project ||
    (project.owner.toString() !== actor.id && actor.role !== "teacher")
  ) {
    throw ApiError.notFound("Project not found");
  }

  return Review.find({ project: projectId })
    .select("-issues")
    .sort({ createdAt: -1 });
}

export async function getReview(actor: Actor, reviewId: string) {
  if (!mongoose.isValidObjectId(reviewId))
    throw ApiError.notFound("Review not found");

  const review = await Review.findById(reviewId);
  if (
    !review ||
    (review.requestedBy.toString() !== actor.id && actor.role !== "teacher")
  ) {
    throw ApiError.notFound("Review not found");
  }
  return review;
}
