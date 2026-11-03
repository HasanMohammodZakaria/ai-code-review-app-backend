import type { Request } from "express";
import { rateLimit } from "express-rate-limit";
import { ApiError } from "../utils/ApiError";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Sends the limit error through the normal errorHandler (same JSON shape)
const limiter = (opts: {
  windowMs: number;
  limit: number;
  message: string;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}) =>
  rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: opts.skipSuccessfulRequests ?? false,
    ...(opts.keyGenerator ? { keyGenerator: opts.keyGenerator } : {}),
    handler: (_req, _res, next) => next(new ApiError(429, opts.message)),
  });

// Whole API, per IP: a safety net against floods
export const apiLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 300,
  message: "Too many requests, please try again later",
});

// Login: only failed attempts count, so normal use is never blocked
export const loginLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  message: "Too many login attempts, please try again in 15 minutes",
});

// Register, forgot and reset password: each call costs a database write or an email
export const accountLimiter = limiter({
  windowMs: HOUR,
  limit: 10,
  message: "Too many attempts, please try again in an hour",
});

// Run Review and Import GitHub use LLM quota and GitHub requests, so the
// limit is per logged-in user (these routes always run after `protect`)
export const reviewLimiter = limiter({
  windowMs: HOUR,
  limit: 30,
  message: "Review limit reached (30 per hour), please try again later",
  keyGenerator: (req) => String(req.user?.id ?? "anonymous"),
});

export const importLimiter = limiter({
  windowMs: HOUR,
  limit: 15,
  message: "Import limit reached (15 per hour), please try again later",
  keyGenerator: (req) => String(req.user?.id ?? "anonymous"),
});
