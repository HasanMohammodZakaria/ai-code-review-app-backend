import { Router } from "express";
import {
  create,
  detail,
  list,
  remove,
  update,
} from "../controllers/project.controller";
import { protect } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  createProjectSchema,
  updateProjectSchema,
} from "../validators/project.validator";

const router = Router();

router.use(protect); // every project route needs a logged-in user

router.post("/", validate(createProjectSchema), create);
router.get("/", list);
router.get("/:id", detail);
router.patch("/:id", validate(updateProjectSchema), update);
router.delete("/:id", remove);

export default router;
