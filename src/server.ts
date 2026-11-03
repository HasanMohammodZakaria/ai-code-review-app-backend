import mongoose from "mongoose";
import app from "./app";
import { env } from "./config/env";
import { connectDB } from "./config/db";

async function start() {
  try {
    await connectDB();

    const server = app.listen(env.PORT, () => {
      console.log(`🚀 Server running on http://localhost:${env.PORT}`);
    });

    // Stop accepting requests, close the database, then exit
    const shutdown = (signal: string) => {
      console.log(`\n${signal} received, shutting down...`);
      server.close(async () => {
        await mongoose.connection.close();
        process.exit(0);
      });
      // Force exit if open connections never finish
      setTimeout(() => process.exit(1), 10_000).unref();
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("❌ Server failed to start:", error);
    process.exit(1);
  }
}

// A promise rejected somewhere nobody awaits. Crash in production so the
// host restarts a clean process; only log in development.
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled rejection:", reason);
  if (env.NODE_ENV === "production") process.exit(1);
});

// The process state is unknown after this, always exit
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught exception:", error);
  process.exit(1);
});

start();
