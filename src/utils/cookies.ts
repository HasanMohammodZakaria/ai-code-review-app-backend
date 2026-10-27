import ms, { type StringValue } from "ms";
import type { CookieOptions } from "express";
import { env } from "../config/env";

export const REFRESH_COOKIE_NAME = "refreshToken";

const isProd = env.NODE_ENV === "production";

const baseOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  path: "/api/auth",
};

export const refreshCookieOptions: CookieOptions = {
  ...baseOptions,
  // Same source as the JWT expiry, so they can never drift apart
  maxAge: ms(env.JWT_REFRESH_EXPIRES_IN as StringValue),
};

export const clearRefreshCookieOptions: CookieOptions = baseOptions;
