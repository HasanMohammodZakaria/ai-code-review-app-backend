import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export interface GoogleProfile {
  googleId: string;
  email: string;
  fullName: string;
  image?: string;
}

// Verifies signature, expiry and audience (our Client ID) with Google
export async function verifyGoogleIdToken(
  idToken: string,
): Promise<GoogleProfile> {
  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw ApiError.unauthorized("Invalid Google token");
  }

  if (!payload?.sub || !payload.email) {
    throw ApiError.unauthorized("Invalid Google token");
  }
  if (!payload.email_verified) {
    throw ApiError.badRequest("Your Google email is not verified");
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    fullName: payload.name ?? payload.email.split("@")[0],
    image: payload.picture,
  };
}
