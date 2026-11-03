import mongoose from "mongoose";
import { Project, type IProjectFile } from "../models/project.model";
import type { UserRole } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { detectLanguage } from "./lint/language";
import { fetchGithubRepoFiles } from "./github-import.service";
import type {
  CreateProjectInput,
  ImportGithubInput,
  UpdateProjectInput,
} from "../validators/project.validator";

interface Actor {
  id: string;
  role: UserRole;
}

const OWNER_FIELDS = "fullName email image";

function normalizeFiles(files: CreateProjectInput["files"]): IProjectFile[] {
  return files.map((f) => ({
    path: f.path,
    language: f.language ?? detectLanguage(f.path),
    content: f.content,
  }));
}

// Loads a project and enforces read access. Students never learn that
// someone else's project exists (404); teachers can read everything.
async function findReadable(id: string, actor: Actor) {
  if (!mongoose.isValidObjectId(id))
    throw ApiError.notFound("Project not found");

  const project = await Project.findById(id);
  if (!project) throw ApiError.notFound("Project not found");

  const isOwner = project.owner.toString() === actor.id;
  if (!isOwner && actor.role !== "teacher")
    throw ApiError.notFound("Project not found");

  return { project, isOwner };
}

export async function createProject(actor: Actor, input: CreateProjectInput) {
  return Project.create({
    owner: actor.id,
    title: input.title,
    description: input.description,
    sourceType: "paste",
    files: normalizeFiles(input.files),
  });
}

// Fetches the public repo's source files from GitHub and saves them in the
// same `files` shape as a pasted project, so reviews work identically.
export async function importGithubProject(
  actor: Actor,
  input: ImportGithubInput,
) {
  const { repoUrl, files, skipped } = await fetchGithubRepoFiles(input.repoUrl);

  const project = await Project.create({
    owner: actor.id,
    title: input.title,
    description: input.description,
    sourceType: "github",
    repoUrl,
    files,
  });

  return { project, skipped };
}

export async function listProjects(actor: Actor, page: number, limit: number) {
  const filter = actor.role === "teacher" ? {} : { owner: actor.id };

  const [items, total] = await Promise.all([
    Project.find(filter)
      .select("-files") // file contents are only returned by the detail endpoint
      .populate("owner", OWNER_FIELDS)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Project.countDocuments(filter),
  ]);

  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getProject(actor: Actor, id: string) {
  const { project } = await findReadable(id, actor);
  await project.populate("owner", OWNER_FIELDS);
  return project;
}

export async function updateProject(
  actor: Actor,
  id: string,
  input: UpdateProjectInput,
) {
  const { project, isOwner } = await findReadable(id, actor);
  if (!isOwner)
    throw ApiError.forbidden("Only the owner can edit this project");

  if (input.title !== undefined) project.title = input.title;
  if (input.description !== undefined) project.description = input.description;
  if (input.files !== undefined) project.files = normalizeFiles(input.files);

  await project.save(); // pre-save keeps fileCount correct
  return project;
}

export async function deleteProject(actor: Actor, id: string) {
  const { project, isOwner } = await findReadable(id, actor);
  if (!isOwner)
    throw ApiError.forbidden("Only the owner can delete this project");

  await project.deleteOne();
}
