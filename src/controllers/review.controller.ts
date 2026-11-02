import type { Request, Response } from "express";
import {
  createReview,
  getReview,
  listReviews,
} from "../services/review/review.service";

// protect middleware guarantees req.user exists
const actor = (req: Request) => ({
  id: req.user!.id as string,
  role: req.user!.role,
});

export async function create(req: Request, res: Response) {
  const review = await createReview(actor(req), String(req.params.id));
  res
    .status(201)
    .json({ success: true, message: "Review completed", data: { review } });
}

export async function list(req: Request, res: Response) {
  const reviews = await listReviews(actor(req), String(req.params.id));
  res.json({ success: true, data: { reviews } });
}

export async function detail(req: Request, res: Response) {
  const review = await getReview(actor(req), String(req.params.id));
  res.json({ success: true, data: { review } });
}
