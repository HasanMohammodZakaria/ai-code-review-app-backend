import multer from "multer";
import { ApiError } from "../utils/ApiError";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

export const uploadImage = multer({
  storage: multer.memoryStorage(), // keep the file in RAM, no disk writes
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(
        ApiError.badRequest("Only JPEG, PNG and WebP images are allowed"),
      );
    }
    cb(null, true);
  },
}).single("image");
