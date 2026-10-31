import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import routes from "./routes";

const app = express();

// Security headers and CORS
app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));

// Body and cookie parsing
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// API routes will be mounted here (e.g. app.use("/api", routes))

app.use("/api", routes);

// 404 and error handlers (must be last, in this order)
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
