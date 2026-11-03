import { Router } from "express";
import {
  login,
  logout,
  me,
  refresh,
  register,
  forgotPasswordHandler,
  resetPasswordHandler,
  googleLoginHandler,
} from "../controllers/auth.controller";
import { uploadImage } from "../middlewares/upload.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  accountLimiter,
  loginLimiter,
} from "../middlewares/rate-limit.middleware";
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  googleLoginSchema,
} from "../validators/auth.validator";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

// limiter first, then multer (parses multipart/form-data), then validation
router.post(
  "/register",
  accountLimiter,
  uploadImage,
  validate(registerSchema),
  register,
);
router.post("/login", loginLimiter, validate(loginSchema), login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.get("/me", protect, me);
router.post(
  "/forgot-password",
  accountLimiter,
  validate(forgotPasswordSchema),
  forgotPasswordHandler,
);
router.post(
  "/reset-password",
  accountLimiter,
  validate(resetPasswordSchema),
  resetPasswordHandler,
);
router.post(
  "/google",
  loginLimiter,
  validate(googleLoginSchema),
  googleLoginHandler,
);

export default router;
