import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

interface ImgbbResponse {
  success: boolean;
  data?: { url: string };
}

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
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new ApiError(502, "Image upload service is unreachable");
  }

  if (!response.ok) {
    throw new ApiError(502, "Image upload failed");
  }

  const json = (await response.json()) as ImgbbResponse;
  if (!json.success || !json.data?.url) {
    throw new ApiError(502, "Image upload failed");
  }

  return json.data.url;
}
