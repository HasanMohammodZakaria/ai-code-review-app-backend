import { z } from "zod";

export const listStudentsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    sort: z
      .enum(["latestScore", "avgScore", "reviewCount", "projectCount", "name"])
      .default("latestScore"),
    order: z.enum(["asc", "desc"]).default("desc"),
    search: z.string().trim().max(100).optional(),
  }),
});

// GET /api/teacher/compare?ids=<id1>,<id2>,<id3>
export const compareStudentsSchema = z.object({
  query: z.object({
    ids: z
      .string()
      .min(1, "ids is required")
      .transform((v) =>
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
      .pipe(
        z
          .array(z.string())
          .min(2, "Provide at least 2 student ids")
          .max(10, "Provide at most 10 student ids"),
      ),
  }),
});

export type ListStudentsQuery = z.infer<typeof listStudentsSchema>["query"];
export type CompareStudentsQuery = z.infer<
  typeof compareStudentsSchema
>["query"];
