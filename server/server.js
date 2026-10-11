import { config } from "./config.js";
import { createDatabase } from "./db/database.js";
import { createAIProvider } from "./services/aiProvider.js";
import { createApp } from "./app.js";

const db = createDatabase(config.databasePath);
const provider = createAIProvider(config);
const app = createApp({
  db,
  provider,
  aiConfigured: Boolean(config.apiKey.trim()),
});
const server = app.listen(config.port, config.host, () => {
  console.log(`Smart Study Agent: http://${config.host}:${config.port}`);
  if (!config.apiKey.trim())
    console.log(
      "Add GEMINI_API_KEY to server/.env to enable generation. Uploads and saved sessions are available.",
    );
});
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${config.port} is busy. Change PORT in server/.env.`
      : "Unable to start the server.",
  );
  db.close();
  process.exitCode = 1;
});
function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
