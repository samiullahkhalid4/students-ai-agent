import express from "express";
import helmet from "helmet";
import multer from "multer";
import path from "node:path";
import { existsSync } from "node:fs";
import { createMemory } from "./agents/memory.js";
import { createAgentController } from "./agents/controller.js";
import { createStudyRoutes } from "./routes/studyRoutes.js";
import { AppError } from "./services/errors.js";
import { serverDir, MAX_FILE_BYTES } from "./config.js";
import { createWriteLimiter } from "./services/rateLimit.js";

export function createApp({ db, memory = createMemory(db), provider, aiConfigured = true, serveClient = true }) {
  const app = express();
  const controller = createAgentController({ memory, provider });
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "32kb" }));
  app.get("/api/health", (req, res) =>
    res.json({
      status: "ok",
      aiConfigured,
      provider: provider.name,
      model: provider.model,
      maxFileBytes: MAX_FILE_BYTES,
      storage: memory.storage || "local",
    }),
  );
  app.use("/api/study", createWriteLimiter(), createStudyRoutes({ memory, controller }));
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API route not found.", code: "NOT_FOUND" }),
  );
  const clientDist = path.resolve(serverDir, "../client/dist");
  if (serveClient && existsSync(path.join(clientDist, "index.html"))) {
    app.use(express.static(clientDist));
    app.get("/{*path}", (req, res) =>
      res.sendFile(path.join(clientDist, "index.html")),
    );
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? `This file is too large. Maximum upload size is ${MAX_FILE_BYTES / 1024 / 1024} MB.`
          : "Upload one lecture file with your name and subject.";
      return res
        .status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400)
        .json({ error: message, code: error.code });
    }
    if (error instanceof AppError)
      return res
        .status(error.status)
        .json({ error: error.message, code: error.code });
    if (error.type === "entity.parse.failed")
      return res
        .status(400)
        .json({
          error: "Request body must be valid JSON.",
          code: "INVALID_JSON",
        });
    if (error.type === "entity.too.large")
      return res
        .status(413)
        .json({
          error: "Request body is too large.",
          code: "REQUEST_TOO_LARGE",
        });
    if (error.code === "ERR_SQLITE_ERROR" || error.name === "LibsqlError")
      return res.status(500).json({
        error: "Study memory is unavailable. Check the database location and available disk space, then try again.",
        code: "DATABASE_ERROR",
      });
    // Avoid logging request bodies, lecture content, or provider errors that may contain secrets.
    console.error("Unexpected server error:", error.name);
    res
      .status(500)
      .json({
        error: "Something went wrong on the server. Please try again.",
        code: "SERVER_ERROR",
      });
  });
  return app;
}
