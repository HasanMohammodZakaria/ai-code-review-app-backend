import type { RequestHandler } from "express";
import type { ZodType } from "zod";

export const validate =
  (schema: ZodType): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse({ body: req.body });

    if (!result.success) {
      return next(result.error); // errorHandler turns ZodError into a 400
    }

    const parsed = result.data as { body: unknown };
    req.body = parsed.body;
    next();
  };
