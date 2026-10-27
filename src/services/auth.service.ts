import type { Request } from "express";
import { User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/token";
import { uploadToImgbb } from "./imgbb.service";
import type { LoginInput, RegisterInput } from "../validators/auth.validator";

const MAX_DEVICES = 5; // keep at most 5 active refresh tokens per user

// Issues access + refresh tokens and stores the refresh token hash
async function issueTokens(user: InstanceType<typeof User>) {
  const payload = { sub: user.id as string, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const decoded = verifyRefreshToken(refreshToken);
  const expiresAt = new Date((decoded.exp as number) * 1000);

  const now = new Date();
  const active = (user.refreshTokens ?? []).filter((t) => t.expiresAt > now);
  active.push({ tokenHash: hashToken(refreshToken), expiresAt });
  user.refreshTokens = active.slice(-MAX_DEVICES);
  await user.save();

  return { accessToken, refreshToken };
}

export async function registerUser(
  input: RegisterInput,
  file?: Express.Multer.File,
) {
  const exists = await User.exists({ email: input.email });
  if (exists)
    throw ApiError.conflict("An account with this email already exists");

  const image = file ? await uploadToImgbb(file) : undefined;

  // role is never taken from the client: new users are always students
  const user = await User.create({
    fullName: input.fullName,
    email: input.email,
    password: input.password,
    image,
    role: "student",
    authProvider: "local",
  });

  const tokens = await issueTokens(user);
  return { user, ...tokens };
}

export async function loginUser(input: LoginInput) {
  const user = await User.findOne({ email: input.email }).select(
    "+password +refreshTokens",
  );

  // Same message for "no user" and "wrong password" (no account enumeration)
  const invalid = ApiError.unauthorized("Invalid email or password");

  if (!user) throw invalid;

  if (user.authProvider === "google") {
    throw ApiError.badRequest(
      "This account uses Google sign-in. Please continue with Google",
    );
  }

  const ok = await user.comparePassword(input.password);
  if (!ok) throw invalid;

  const tokens = await issueTokens(user);
  return { user, ...tokens };
}
