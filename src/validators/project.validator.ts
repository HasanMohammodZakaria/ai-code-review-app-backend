import { z } from "zod";

const fileSchema = z.object({
  path: z.string().trim().min(1, "File path is required").max(200),
  // optional: the server detects it from the extension when missing
  language: z.string().trim().toLowerCase().min(1).max(30).optional(),
  content: z
    .string()
    .min(1, "File content is required")
    .max(100_000, "File is too large (max 100,000 characters)"),
});

const filesSchema = z
  .array(fileSchema)
  .min(1, "At least one file is required")
  .max(20, "At most 20 files");

export const createProjectSchema = z.object({
  body: z.object({
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).optional(),
    files: filesSchema,
  }),
});

export const updateProjectSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().max(1000).optional(),
      files: filesSchema.optional(),
    })
    .refine(
      (b) => Object.keys(b).length > 0,
      "Provide at least one field to update",
    ),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>["body"];
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>["body"];
