import { Router } from "express";
import { login, register } from "../controllers/auth.controller";
import { uploadImage } from "../middlewares/upload.middleware";
import { validate } from "../middlewares/validate.middleware";
import { loginSchema, registerSchema } from "../validators/auth.validator";

const router = Router();

// multer runs first (parses multipart/form-data), then validation
router.post("/register", uploadImage, validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);

export default router;
