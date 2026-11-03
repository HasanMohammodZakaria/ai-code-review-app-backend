import mongoose from "mongoose";
import { Project } from "../models/project.model";
import { Review } from "../models/review.model";

const round1 = (n: number) => Math.round(n * 10) / 10;

const HISTORY_LIMIT = 20;

// Dashboard numbers for the logged-in user's own projects and reviews
export async function getMyOverview(userId: string) {
  const owner = new mongoose.Types.ObjectId(userId);

  const projects = await Project.find({ owner })
    .select("-files")
    .sort({ createdAt: -1 })
    .lean();

  // Only reviews of projects that still exist
  const reviewMatch = {
    requestedBy: owner,
    project: { $in: projects.map((p) => p._id) },
  };

  const [totals, perProject, recent] = await Promise.all([
    Review.aggregate<{
      reviewCount: number;
      avgScore: number;
      latestScore: number;
      lastReviewAt: Date;
      high: number;
      medium: number;
      low: number;
    }>([
      { $match: reviewMatch },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: null,
          reviewCount: { $sum: 1 },
          avgScore: { $avg: "$qualityScore" },
          latestScore: { $first: "$qualityScore" },
          lastReviewAt: { $first: "$createdAt" },
          high: { $sum: "$issueCounts.high" },
          medium: { $sum: "$issueCounts.medium" },
          low: { $sum: "$issueCounts.low" },
        },
      },
    ]),
    Review.aggregate<{
      _id: mongoose.Types.ObjectId;
      qualityScore: number;
      createdAt: Date;
      reviewCount: number;
    }>([
      { $match: reviewMatch },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$project",
          qualityScore: { $first: "$qualityScore" },
          createdAt: { $first: "$createdAt" },
          reviewCount: { $sum: 1 },
        },
      },
    ]),
    // newest first from the database, flipped below for a line chart
    Review.find(reviewMatch)
      .select("project qualityScore issueCounts reviewMode createdAt")
      .sort({ createdAt: -1 })
      .limit(HISTORY_LIMIT)
      .lean(),
  ]);

  const t = totals[0];
  const latestByProject = new Map(
    perProject.map((r) => [String(r._id), r] as const),
  );

  return {
    summary: {
      projectCount: projects.length,
      reviewCount: t?.reviewCount ?? 0,
      latestScore: t?.latestScore ?? null,
      avgScore: t ? round1(t.avgScore) : null,
      lastReviewAt: t?.lastReviewAt ?? null,
      issueTotals: t
        ? { high: t.high, medium: t.medium, low: t.low }
        : { high: 0, medium: 0, low: 0 },
    },
    projects: projects.map((p) => {
      const l = latestByProject.get(String(p._id));
      return {
        ...p,
        latestScore: l?.qualityScore ?? null,
        lastReviewAt: l?.createdAt ?? null,
        reviewCount: l?.reviewCount ?? 0,
      };
    }),
    history: recent.reverse(), // oldest first, last 20 reviews
  };
}
