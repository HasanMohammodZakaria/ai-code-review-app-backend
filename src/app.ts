import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env";

const app = express();

// Security headers and CORS
app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));

// Body and cookie parsing
app.use(express.json());
app.use(cookieParser());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// 404 handler (must be after all routes)
app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

export default app;
