import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Invalid email address"));

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const registerSchema = z.object({
  body: z.object({
    fullName: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .max(80),
    email: emailSchema,
    password: passwordSchema,
    // `role` is intentionally NOT accepted: every new user is a student
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: z.string().min(1, "Password is required"),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>["body"];
export type LoginInput = z.infer<typeof loginSchema>["body"];

export const forgotPasswordSchema = z.object({
  body: z.object({ email: emailSchema }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, "Token is required"),
    password: passwordSchema,
  }),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>["body"];
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>["body"];

export const googleLoginSchema = z.object({
  body: z.object({ idToken: z.string().min(1, "idToken is required") }),
});

export type GoogleLoginInput = z.infer<typeof googleLoginSchema>["body"];

// Logged-in password change. The old password is only checked for presence
// here; the service compares it with the stored hash.
export const changePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z.string().min(1, "Current password is required"),
      newPassword: passwordSchema,
    })
    .refine((b) => b.currentPassword !== b.newPassword, {
      message: "New password must be different from the current password",
      path: ["newPassword"],
    }),
});

// Profile update is multipart/form-data (optional image), so every field is
// optional here. "At least one of name or image" is checked in the service,
// because the image is not part of the body.
// `email` and `role` are intentionally NOT accepted: unknown keys are stripped.
export const updateProfileSchema = z.object({
  body: z.object({
    fullName: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .max(80)
      .optional(),
  }),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>["body"];
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>["body"];
