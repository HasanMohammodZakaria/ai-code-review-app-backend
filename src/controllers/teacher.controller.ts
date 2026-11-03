import type { Request, Response } from "express";
import {
  compareStudents,
  getOverview,
  getStudentDetail,
  listStudents,
} from "../services/teacher/teacher.service";
import {
  compareStudentsSchema,
  listStudentsSchema,
} from "../validators/teacher.validator";

export async function overview(_req: Request, res: Response) {
  const data = await getOverview();
  res.json({ success: true, data });
}

export async function students(req: Request, res: Response) {
  const { query } = listStudentsSchema.parse({ query: req.query });
  const data = await listStudents(query);
  res.json({ success: true, data });
}

export async function studentDetail(req: Request, res: Response) {
  const data = await getStudentDetail(String(req.params.id));
  res.json({ success: true, data });
}

export async function compare(req: Request, res: Response) {
  const { query } = compareStudentsSchema.parse({ query: req.query });
  const data = await compareStudents(query.ids);
  res.json({ success: true, data: { students: data } });
}
