import { Router } from "express";
import authRoutes from "./auth.routes";
import projectRoutes from "./project.routes";
import reviewRoutes from "./review.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/projects", projectRoutes);
router.use("/reviews", reviewRoutes);

export default router;
