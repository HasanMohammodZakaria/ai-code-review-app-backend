import type { Request, Response } from "express";
import {
  loginUser,
  logoutUser,
  refreshSession,
  registerUser,
} from "../services/auth.service";
import {
  clearRefreshCookieOptions,
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
} from "../utils/cookies";

export async function register(req: Request, res: Response) {
  const { user, accessToken, refreshToken } = await registerUser(
    req.body,
    req.file,
  );

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);
  res.status(201).json({
    success: true,
    message: "Registration successful",
    data: { user, accessToken },
  });
}

export async function login(req: Request, res: Response) {
  const { user, accessToken, refreshToken } = await loginUser(req.body);

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);
  res.json({
    success: true,
    message: "Login successful",
    data: { user, accessToken },
  });
}

export async function refresh(req: Request, res: Response) {
  const { user, accessToken, refreshToken } = await refreshSession(
    req.cookies?.[REFRESH_COOKIE_NAME],
  );

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);
  res.json({
    success: true,
    message: "Token refreshed",
    data: { user, accessToken },
  });
}

export async function logout(req: Request, res: Response) {
  await logoutUser(req.cookies?.[REFRESH_COOKIE_NAME]);

  res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions);
  res.json({ success: true, message: "Logged out" });
}

export async function me(req: Request, res: Response) {
  res.json({ success: true, data: { user: req.user } });
}
