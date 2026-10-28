import { Router } from "express";
import {
  login,
  logout,
  me,
  refresh,
  register,
  forgotPasswordHandler,
  resetPasswordHandler,
} from "../controllers/auth.controller";
import { uploadImage } from "../middlewares/upload.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validators/auth.validator";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

// multer runs first (parses multipart/form-data), then validation
router.post("/register", uploadImage, validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.get("/me", protect, me);
router.post(
  "/forgot-password",
  validate(forgotPasswordSchema),
  forgotPasswordHandler,
);
router.post(
  "/reset-password",
  validate(resetPasswordSchema),
  resetPasswordHandler,
);

export default router;
