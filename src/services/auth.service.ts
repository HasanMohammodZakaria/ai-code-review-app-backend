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
import type {
  LoginInput,
  RegisterInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from "../validators/auth.validator";
import { sendPasswordResetEmail } from "./email.service";

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

// Rotation: every refresh invalidates the old token and issues a new pair
export async function refreshSession(oldRefreshToken: string | undefined) {
  if (!oldRefreshToken) throw ApiError.unauthorized("Refresh token missing");

  const decoded = verifyRefreshToken(oldRefreshToken);
  const user = await User.findById(decoded.sub).select("+refreshTokens");
  if (!user) throw ApiError.unauthorized("Invalid refresh token");

  const oldHash = hashToken(oldRefreshToken);
  const stored = (user.refreshTokens ?? []).find(
    (t) => t.tokenHash === oldHash,
  );

  if (!stored || stored.expiresAt < new Date()) {
    // Possible token reuse (theft): revoke every session of this user
    user.refreshTokens = [];
    await user.save();
    throw ApiError.unauthorized("Invalid refresh token. Please log in again");
  }

  // Remove the used token, then issue a fresh pair
  user.refreshTokens = user.refreshTokens.filter(
    (t) => t.tokenHash !== oldHash,
  );
  const tokens = await issueTokens(user);
  return { user, ...tokens };
}

export async function logoutUser(refreshToken: string | undefined) {
  if (!refreshToken) return; // nothing to revoke

  try {
    const decoded = verifyRefreshToken(refreshToken);
    const hash = hashToken(refreshToken);
    await User.updateOne(
      { _id: decoded.sub },
      { $pull: { refreshTokens: { tokenHash: hash } } },
    );
  } catch {
    // invalid/expired token: the cookie is cleared anyway
  }
}

export async function forgotPassword(input: ForgotPasswordInput) {
  const user = await User.findOne({ email: input.email });

  // Google-only users have no password; unknown emails are ignored.
  // The controller always returns the same message either way.
  if (!user || user.authProvider !== "local") return;

  const rawToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  try {
    await sendPasswordResetEmail(user.email, user.fullName, rawToken);
  } catch (error) {
    // Do not keep a token the user never received
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    console.error("❌ Failed to send reset email:", error);
  }
}

export async function resetPassword(input: ResetPasswordInput) {
  const hashedToken = hashToken(input.token);

  const user = await User.findOne({
    passwordResetTokenHash: hashedToken,
    passwordResetExpires: { $gt: new Date() },
  }).select("+refreshTokens");

  if (!user) throw ApiError.badRequest("Reset link is invalid or has expired");

  user.password = input.password; // pre("save") hashes it and sets passwordChangedAt
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokens = []; // log out every device
  await user.save();
}
