import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { Schema, model, type Model } from "mongoose";

export const USER_ROLES = ["student", "teacher"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const AUTH_PROVIDERS = ["local", "google"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

const SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface IRefreshToken {
  tokenHash: string;
  expiresAt: Date;
}

export interface IUser {
  fullName: string;
  email: string;
  password?: string; // absent for Google-only users
  image?: string;
  role: UserRole;
  authProvider: AuthProvider;
  googleId?: string;
  isEmailVerified: boolean;
  refreshTokens: IRefreshToken[];
  passwordResetTokenHash?: string;
  passwordResetExpires?: Date;
  passwordChangedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
  // Returns the RAW token (to email to the user). Only its hash is stored.
  createPasswordResetToken(): string;
  // True if the password was changed after the given JWT was issued.
  changedPasswordAfter(jwtIssuedAt: number): boolean;
}

type UserModel = Model<IUser, Record<string, never>, IUserMethods>;

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      // Only local users need a password
      required: [
        function (this: { authProvider?: string }) {
          return this.authProvider === "local";
        },
        "Password is required",
      ],
      select: false,
    },
    image: { type: String, trim: true },
    role: {
      type: String,
      enum: USER_ROLES,
      default: "student",
    },
    authProvider: {
      type: String,
      enum: AUTH_PROVIDERS,
      default: "local",
    },
    googleId: { type: String, unique: true, sparse: true },
    isEmailVerified: { type: Boolean, default: false },
    refreshTokens: { type: [refreshTokenSchema], default: [], select: false },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    passwordChangedAt: { type: Date, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      // Safety net: never leak secrets even if a field was selected by mistake
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.password;
        delete ret.refreshTokens;
        delete ret.passwordResetTokenHash;
        delete ret.passwordResetExpires;
        delete ret.passwordChangedAt;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Hash the password whenever it is new or changed
userSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) return;

  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);

  if (!this.isNew) {
    // 1s in the past so a JWT issued right after the change is still valid
    this.passwordChangedAt = new Date(Date.now() - 1000);
  }
});

userSchema.method("comparePassword", function (candidate: string) {
  // Google-only users have no password hash
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
});

userSchema.method("createPasswordResetToken", function () {
  const rawToken = crypto.randomBytes(32).toString("hex");
  this.passwordResetTokenHash = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");
  this.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  return rawToken;
});

userSchema.method("changedPasswordAfter", function (jwtIssuedAt: number) {
  if (!this.passwordChangedAt) return false;
  return Math.floor(this.passwordChangedAt.getTime() / 1000) > jwtIssuedAt;
});

export const User = model<IUser, UserModel>("User", userSchema);
