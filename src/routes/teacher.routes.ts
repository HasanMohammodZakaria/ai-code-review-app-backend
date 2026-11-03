import { Router } from "express";
import {
  compare,
  overview,
  studentDetail,
  students,
} from "../controllers/teacher.controller";
import { protect, restrictTo } from "../middlewares/auth.middleware";

const router = Router();

// every teacher route needs a logged-in teacher (students get 403)
router.use(protect, restrictTo("teacher"));

router.get("/overview", overview);
router.get("/students", students);
router.get("/students/:id", studentDetail);
router.get("/compare", compare);

export default router;
