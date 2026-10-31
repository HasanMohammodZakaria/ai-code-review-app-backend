import type { Request, Response } from "express";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from "../services/project.service";

// protect middleware guarantees req.user exists
const actor = (req: Request) => ({
  id: req.user!.id as string,
  role: req.user!.role,
});

const idParam = (req: Request) => String(req.params.id);

export async function create(req: Request, res: Response) {
  const project = await createProject(actor(req), req.body);
  res
    .status(201)
    .json({ success: true, message: "Project created", data: { project } });
}

export async function list(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

  const result = await listProjects(actor(req), page, limit);
  res.json({ success: true, data: result });
}

export async function detail(req: Request, res: Response) {
  const project = await getProject(actor(req), idParam(req));
  res.json({ success: true, data: { project } });
}

export async function update(req: Request, res: Response) {
  const project = await updateProject(actor(req), idParam(req), req.body);
  res.json({ success: true, message: "Project updated", data: { project } });
}

export async function remove(req: Request, res: Response) {
  await deleteProject(actor(req), idParam(req));
  res.json({ success: true, message: "Project deleted" });
}
