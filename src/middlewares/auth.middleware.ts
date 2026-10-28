import type { RequestHandler } from "express";
import { User, type UserRole } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { verifyAccessToken } from "../utils/token";

// Verifies the access token and attaches the user to req.user
export const protect: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Authentication required");
  }

  const decoded = verifyAccessToken(header.slice(7));

  const user = await User.findById(decoded.sub).select("+passwordChangedAt");
  if (!user) throw ApiError.unauthorized("User no longer exists");

  if (decoded.iat && user.changedPasswordAfter(decoded.iat)) {
    throw ApiError.unauthorized("Password was changed. Please log in again");
  }

  req.user = user;
  next();
};

// Usage: restrictTo("teacher")
export const restrictTo =
  (...roles: UserRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw ApiError.forbidden(
        "You do not have permission to perform this action",
      );
    }
    next();
  };
