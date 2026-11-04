import { Router } from "express";
import {
  changePasswordHandler,
  forgotPasswordHandler,
  googleLoginHandler,
  login,
  logout,
  me,
  refresh,
  register,
  resetPasswordHandler,
  updateProfileHandler,
} from "../controllers/auth.controller";
import { uploadImage } from "../middlewares/upload.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  accountLimiter,
  loginLimiter,
  passwordLimiter,
} from "../middlewares/rate-limit.middleware";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  googleLoginSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
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
// multipart/form-data: optional `fullName` and optional `image`
router.patch(
  "/me",
  protect,
  uploadImage,
  validate(updateProfileSchema),
  updateProfileHandler,
);
router.patch(
  "/password",
  protect,
  passwordLimiter,
  validate(changePasswordSchema),
  changePasswordHandler,
);

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
