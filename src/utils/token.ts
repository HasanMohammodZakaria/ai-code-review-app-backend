import crypto from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "./ApiError";

export interface TokenPayload {
  sub: string; // user id
  role: string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as SignOptions);
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(
    // jti makes every refresh token unique even within the same second
    { ...payload, jti: crypto.randomUUID() },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as SignOptions,
  );
}

function verify(token: string, secret: string): jwt.JwtPayload & TokenPayload {
  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded === "string") throw new Error("Invalid payload");
    return decoded as jwt.JwtPayload & TokenPayload;
  } catch {
    throw ApiError.unauthorized("Invalid or expired token");
  }
}

export const verifyAccessToken = (token: string) =>
  verify(token, env.JWT_ACCESS_SECRET);
export const verifyRefreshToken = (token: string) =>
  verify(token, env.JWT_REFRESH_SECRET);

// Refresh tokens are stored hashed (SHA-256) so a DB leak cannot be replayed
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
