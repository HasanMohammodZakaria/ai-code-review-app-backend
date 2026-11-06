import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

interface ImgbbResponse {
  success: boolean;
  data?: { url: string };
}

/** A 2 MB photo becomes about 2.7 MB of base64, so a slow upload needs more than 15 seconds */
const UPLOAD_TIMEOUT_MS = 45_000;

export async function uploadToImgbb(
  file: Express.Multer.File,
): Promise<string> {
  const form = new FormData();
  form.append("image", file.buffer.toString("base64"));

  let response: Response;
  try {
    response = await fetch(
      `https://api.imgbb.com/1/upload?key=${env.IMGBB_API_KEY}`,
      {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      },
    );
  } catch (error) {
    // Logs the real reason (timeout, DNS, connection reset) and its cause
    console.error("ImgBB upload failed:", error);
    throw new ApiError(502, "Image upload service is unreachable");
  }

  if (!response.ok) {
    // ImgBB answered, so say what it answered (for example an invalid API key)
    const detail = await response.text().catch(() => "");
    console.error("ImgBB responded with", response.status, detail);
    throw new ApiError(502, "Image upload failed");
  }

  const json = (await response.json()) as ImgbbResponse;
  if (!json.success || !json.data?.url) {
    console.error("ImgBB returned an unexpected body:", json);
    throw new ApiError(502, "Image upload failed");
  }

  return json.data.url;
}
