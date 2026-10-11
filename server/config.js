import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(serverDir, ".env"), quiet: true });
export const config = {
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || "127.0.0.1",
  provider: process.env.AI_PROVIDER || "gemini",
  model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  apiKey: process.env.GEMINI_API_KEY || "",
  databasePath: process.env.DATABASE_PATH
    ? path.resolve(serverDir, process.env.DATABASE_PATH)
    : path.join(serverDir, "db", "study.sqlite"),
};
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_LECTURE_CHARS = 60000;
