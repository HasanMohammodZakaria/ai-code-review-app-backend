import mongoose, { type Types } from "mongoose";
import { Project } from "../../models/project.model";
import { Review } from "../../models/review.model";
import { User } from "../../models/user.model";
import { ApiError } from "../../utils/ApiError";

const STUDENT_FIELDS = "fullName email image createdAt";

export type StudentSortKey =
  | "latestScore"
  | "avgScore"
  | "reviewCount"
  | "projectCount"
  | "name";

interface StudentStats {
  projectCount: number;
  reviewCount: number;
  latestScore: number | null;
  avgScore: number | null;
  lastReviewAt: Date | null;
  issueTotals: { high: number; medium: number; low: number };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const emptyStats = (): StudentStats => ({
  projectCount: 0,
  reviewCount: 0,
  latestScore: null,
  avgScore: null,
  lastReviewAt: null,
  issueTotals: { high: 0, medium: 0, low: 0 },
});

function toObjectId(id: string, label: string): Types.ObjectId {
  if (!mongoose.isValidObjectId(id))
    throw ApiError.notFound(`${label} not found`);
  return new mongoose.Types.ObjectId(id);
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Per-student numbers from reviews and projects (all students when ids is omitted)
async function collectStats(ids?: Types.ObjectId[]) {
  const reviewMatch = ids ? { requestedBy: { $in: ids } } : {};
  const projectMatch = ids ? { owner: { $in: ids } } : {};

  const [reviewRows, projectRows] = await Promise.all([
    Review.aggregate<{
      _id: Types.ObjectId;
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
          _id: "$requestedBy",
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
    Project.aggregate<{ _id: Types.ObjectId; projectCount: number }>([
      { $match: projectMatch },
      { $group: { _id: "$owner", projectCount: { $sum: 1 } } },
    ]),
  ]);

  const stats = new Map<string, StudentStats>();
  const get = (id: Types.ObjectId) => {
    const key = String(id);
    if (!stats.has(key)) stats.set(key, emptyStats());
    return stats.get(key)!;
  };

  for (const r of reviewRows) {
    const s = get(r._id);
    s.reviewCount = r.reviewCount;
    s.avgScore = round1(r.avgScore);
    s.latestScore = r.latestScore;
    s.lastReviewAt = r.lastReviewAt;
    s.issueTotals = { high: r.high, medium: r.medium, low: r.low };
  }
  for (const p of projectRows) get(p._id).projectCount = p.projectCount;

  return stats;
}

// Latest review per project (one row per project)
function latestPerProject(match: Record<string, unknown> = {}) {
  return Review.aggregate<{
    _id: Types.ObjectId;
    qualityScore: number;
    createdAt: Date;
    reviewCount: number;
  }>([
    { $match: match },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$project",
        qualityScore: { $first: "$qualityScore" },
        createdAt: { $first: "$createdAt" },
        reviewCount: { $sum: 1 },
      },
    },
  ]);
}

export async function getOverview() {
  const [students, projects, reviews, totals, latest] = await Promise.all([
    User.countDocuments({ role: "student" }),
    Project.countDocuments(),
    Review.countDocuments(),
    Review.aggregate<{
      avgScore: number;
      high: number;
      medium: number;
      low: number;
    }>([
      {
        $group: {
          _id: null,
          avgScore: { $avg: "$qualityScore" },
          high: { $sum: "$issueCounts.high" },
          medium: { $sum: "$issueCounts.medium" },
          low: { $sum: "$issueCounts.low" },
        },
      },
    ]),
    latestPerProject(),
  ]);

  const t = totals[0];

  // How many projects fall in each score band (by their latest review)
  const bands = [
    { label: "0-39", min: 0, max: 39, projects: 0 },
    { label: "40-59", min: 40, max: 59, projects: 0 },
    { label: "60-79", min: 60, max: 79, projects: 0 },
    { label: "80-100", min: 80, max: 100, projects: 0 },
  ];
  for (const row of latest) {
    const band = bands.find(
      (b) => row.qualityScore >= b.min && row.qualityScore <= b.max,
    );
    if (band) band.projects++;
  }

  const latestAvg = latest.length
    ? round1(latest.reduce((sum, r) => sum + r.qualityScore, 0) / latest.length)
    : null;

  return {
    students,
    projects,
    reviews,
    avgScore: t ? round1(t.avgScore) : null,
    avgLatestProjectScore: latestAvg,
    issueTotals: t
      ? { high: t.high, medium: t.medium, low: t.low }
      : { high: 0, medium: 0, low: 0 },
    scoreBands: bands.map(({ label, projects }) => ({ label, projects })),
  };
}

export async function listStudents(opts: {
  page: number;
  limit: number;
  sort: StudentSortKey;
  order: "asc" | "desc";
  search?: string;
}) {
  const filter: Record<string, unknown> = { role: "student" };
  if (opts.search) {
    const rx = new RegExp(escapeRegex(opts.search), "i");
    filter.$or = [{ fullName: rx }, { email: rx }];
  }

  const [users, stats] = await Promise.all([
    User.find(filter).select(STUDENT_FIELDS).lean(),
    collectStats(),
  ]);

  const rows = users.map((u) => ({
    student: u,
    ...(stats.get(String(u._id)) ?? emptyStats()),
  }));

  // Sorting and paging happen in memory: simple and fine for a class-sized list
  const dir = opts.order === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    if (opts.sort === "name")
      return dir * a.student.fullName.localeCompare(b.student.fullName);

    const av = a[opts.sort];
    const bv = b[opts.sort];
    if (av === null && bv === null) return 0;
    if (av === null) return 1; // students without reviews always last
    if (bv === null) return -1;
    return dir * (av - bv);
  });

  const total = rows.length;
  const items = rows.slice(
    (opts.page - 1) * opts.limit,
    opts.page * opts.limit,
  );

  return {
    items,
    total,
    page: opts.page,
    limit: opts.limit,
    pages: Math.ceil(total / opts.limit),
  };
}

async function findStudent(id: string) {
  const objectId = toObjectId(id, "Student");
  const student = await User.findOne({ _id: objectId, role: "student" })
    .select(STUDENT_FIELDS)
    .lean();
  if (!student) throw ApiError.notFound("Student not found");
  return { student, objectId };
}

export async function getStudentDetail(id: string) {
  const { student, objectId } = await findStudent(id);

  const [stats, projects, latest, history] = await Promise.all([
    collectStats([objectId]),
    Project.find({ owner: objectId })
      .select("-files")
      .sort({ createdAt: -1 })
      .lean(),
    latestPerProject({ requestedBy: objectId }),
    // score history, oldest first, ready for a line chart
    Review.find({ requestedBy: objectId })
      .select("project qualityScore issueCounts reviewMode createdAt")
      .sort({ createdAt: 1 })
      .lean(),
  ]);

  const latestByProject = new Map(
    latest.map((r) => [String(r._id), r] as const),
  );

  return {
    student,
    summary: stats.get(String(objectId)) ?? emptyStats(),
    projects: projects.map((p) => {
      const l = latestByProject.get(String(p._id));
      return {
        ...p,
        latestScore: l?.qualityScore ?? null,
        lastReviewAt: l?.createdAt ?? null,
        reviewCount: l?.reviewCount ?? 0,
      };
    }),
    history,
  };
}

// Side-by-side comparison of 2 to 10 students
export async function compareStudents(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length < 2 || unique.length > 10)
    throw ApiError.badRequest("Provide between 2 and 10 student ids");

  const objectIds = unique.map((id) => toObjectId(id, "Student"));

  const [users, stats, reviews] = await Promise.all([
    User.find({ _id: { $in: objectIds }, role: "student" })
      .select(STUDENT_FIELDS)
      .lean(),
    collectStats(objectIds),
    Review.find({ requestedBy: { $in: objectIds } })
      .select("requestedBy qualityScore createdAt")
      .sort({ createdAt: 1 })
      .lean(),
  ]);

  if (users.length !== objectIds.length)
    throw ApiError.notFound("One or more students were not found");

  const historyBy = new Map<
    string,
    { createdAt: Date; qualityScore: number }[]
  >();
  for (const r of reviews) {
    const key = String(r.requestedBy);
    if (!historyBy.has(key)) historyBy.set(key, []);
    historyBy.get(key)!.push({
      createdAt: r.createdAt,
      qualityScore: r.qualityScore,
    });
  }

  // keep the order the teacher asked for
  const byId = new Map(users.map((u) => [String(u._id), u] as const));
  return unique.map((id) => ({
    student: byId.get(id)!,
    ...(stats.get(id) ?? emptyStats()),
    history: historyBy.get(id) ?? [],
  }));
}
