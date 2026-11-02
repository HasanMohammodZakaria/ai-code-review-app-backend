import { Router } from "express";
import { detail } from "../controllers/review.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

router.use(protect);
router.get("/:id", detail);

export default router;
