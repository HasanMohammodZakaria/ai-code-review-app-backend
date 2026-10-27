import type { Request, Response } from "express";
import { loginUser, registerUser } from "../services/auth.service";
import { refreshCookieOptions } from "../utils/cookies";
import { REFRESH_COOKIE_NAME } from "../utils/cookies";

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
