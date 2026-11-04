import type { HydratedDocument } from "mongoose";
import { User } from "../models/user.model";
import type { IUser, IUserMethods } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/token";
import { uploadToImgbb } from "./imgbb.service";
import { sendPasswordResetEmail } from "./email.service";
import { verifyGoogleIdToken } from "./google.service";
import type {
  LoginInput,
  RegisterInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  GoogleLoginInput,
  ChangePasswordInput,
  UpdateProfileInput,
} from "../validators/auth.validator";

type UserDoc = HydratedDocument<IUser, IUserMethods>;

const MAX_DEVICES = 5; // keep at most 5 active refresh tokens per user

// Issues access + refresh tokens and stores the refresh token hash
async function issueTokens(user: UserDoc) {
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
  const user = (await User.create({
    fullName: input.fullName,
    email: input.email,
    password: input.password,
    image,
    role: "student",
    authProvider: "local",
  })) as UserDoc;

  const tokens = await issueTokens(user);
  return { user, ...tokens };
}

export async function loginUser(input: LoginInput) {
  const user = (await User.findOne({ email: input.email }).select(
    "+password +refreshTokens",
  )) as UserDoc | null;

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
  const user = (await User.findById(decoded.sub).select(
    "+refreshTokens",
  )) as UserDoc | null;
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
  const user = (await User.findOne({
    email: input.email,
  })) as UserDoc | null;

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

  const user = (await User.findOne({
    passwordResetTokenHash: hashedToken,
    passwordResetExpires: { $gt: new Date() },
  }).select("+refreshTokens")) as UserDoc | null;

  if (!user) throw ApiError.badRequest("Reset link is invalid or has expired");

  user.password = input.password; // pre("save") hashes it and sets passwordChangedAt
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokens = []; // log out every device
  await user.save();
}

// Logged-in password change. Every other device is logged out, but this
// device gets a fresh token pair so the user stays signed in.
export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
) {
  const user = (await User.findById(userId).select(
    "+password +refreshTokens",
  )) as UserDoc | null;
  if (!user) throw ApiError.unauthorized("User no longer exists");

  if (user.authProvider === "google") {
    throw ApiError.badRequest(
      "This account uses Google sign-in and has no password to change",
    );
  }

  // 400, not 401: a 401 would make the client think the access token expired
  const ok = await user.comparePassword(input.currentPassword);
  if (!ok) throw ApiError.badRequest("Current password is incorrect");

  user.password = input.newPassword; // pre("save") hashes it and sets passwordChangedAt
  user.refreshTokens = []; // revoke every session

  // issueTokens saves the user, so the new password and the new session
  // are written together in one save
  const tokens = await issueTokens(user);
  return { user, ...tokens };
}

// Updates the name and/or the profile image. Email and role cannot change.
export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
  file?: Express.Multer.File,
) {
  if (input.fullName === undefined && !file) {
    throw ApiError.badRequest("Provide a new name or a new image");
  }

  const user = (await User.findById(userId)) as UserDoc | null;
  if (!user) throw ApiError.unauthorized("User no longer exists");

  if (input.fullName !== undefined) user.fullName = input.fullName;
  if (file) user.image = await uploadToImgbb(file);

  await user.save();
  return user;
}

export async function googleLogin(input: GoogleLoginInput) {
  const profile = await verifyGoogleIdToken(input.idToken);

  // 1) Already linked by googleId, 2) same verified email, 3) brand new user
  let user = (await User.findOne({ googleId: profile.googleId }).select(
    "+refreshTokens",
  )) as UserDoc | null;

  if (!user) {
    user = (await User.findOne({ email: profile.email }).select(
      "+refreshTokens",
    )) as UserDoc | null;

    if (user) {
      // Account linking: Google verified ownership of this email
      user.googleId = profile.googleId;
      user.isEmailVerified = true;
      if (!user.image && profile.image) user.image = profile.image;
      await user.save();
    } else {
      user = (await User.create({
        fullName: profile.fullName,
        email: profile.email,
        image: profile.image,
        role: "student", // never taken from the client
        authProvider: "google",
        googleId: profile.googleId,
        isEmailVerified: true,
      })) as UserDoc;
    }
  }

  const tokens = await issueTokens(user);
  return { user, ...tokens };
}
