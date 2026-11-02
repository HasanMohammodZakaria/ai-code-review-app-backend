import { Schema, model, type Types } from "mongoose";

export const SEVERITIES = ["high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CATEGORIES = ["bug", "security", "style", "improvement"] as const;
export type Category = (typeof CATEGORIES)[number];

export const ISSUE_SOURCES = ["lint", "llm", "lint+llm"] as const;
export type IssueSource = (typeof ISSUE_SOURCES)[number];

export const REVIEW_MODES = ["ai+lint", "ai-only", "lint-only"] as const;
export type ReviewMode = (typeof REVIEW_MODES)[number];

export interface IIssue {
  file: string;
  line: number;
  severity: Severity;
  category: Category;
  message: string;
  rule?: string;
  explanation?: string;
  suggestedFix?: string;
  source: IssueSource;
}

export interface IReview {
  project: Types.ObjectId;
  requestedBy: Types.ObjectId;
  reviewMode: ReviewMode;
  provider?: string;
  model?: string;
  summary: string;
  qualityScore: number;
  issueCounts: { high: number; medium: number; low: number };
  filesReviewed: number;
  filesSkipped: string[];
  unlintedLanguages: string[];
  issues: IIssue[];
  createdAt: Date;
  updatedAt: Date;
}

const issueSchema = new Schema<IIssue>(
  {
    file: { type: String, required: true },
    line: { type: Number, required: true },
    severity: { type: String, enum: SEVERITIES, required: true },
    category: { type: String, enum: CATEGORIES, required: true },
    message: { type: String, required: true, maxlength: 1000 },
    rule: { type: String },
    explanation: { type: String, maxlength: 2000 },
    suggestedFix: { type: String, maxlength: 4000 },
    source: { type: String, enum: ISSUE_SOURCES, required: true },
  },
  { _id: false },
);

const reviewSchema = new Schema<IReview>(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reviewMode: { type: String, enum: REVIEW_MODES, required: true },
    provider: { type: String },
    model: { type: String },
    summary: { type: String, default: "" },
    qualityScore: { type: Number, min: 0, max: 100, required: true },
    issueCounts: {
      high: { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      low: { type: Number, default: 0 },
    },
    filesReviewed: { type: Number, default: 0 },
    filesSkipped: { type: [String], default: [] },
    unlintedLanguages: { type: [String], default: [] },
    issues: { type: [issueSchema], default: [] },
  },
  { timestamps: true },
);

export const Review = model<IReview>("Review", reviewSchema);
