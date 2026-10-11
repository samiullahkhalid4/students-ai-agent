import { createApp } from "./app.js";
import { createAIProvider } from "./services/aiProvider.js";
import { createTursoMemory } from "./agents/tursoMemory.js";
import { AppError } from "./services/errors.js";

export function createVercelHandler(settings, makeMemory = createTursoMemory) {
  let appPromise;
  async function initialize() {
    if (!settings.tursoUrl || !settings.tursoToken) {
      throw new AppError(503,
        "Hosted database is not configured. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel environment variables, then redeploy.",
        "MISSING_DATABASE_CONFIG");
    }
    if (!/^(libsql|https):\/\//.test(settings.tursoUrl)) {
      throw new AppError(503, "TURSO_DATABASE_URL must be a hosted libsql:// or https:// URL.", "INVALID_DATABASE_CONFIG");
    }
    const memory = await makeMemory({ url: settings.tursoUrl, authToken: settings.tursoToken });
    return createApp({ memory, provider: createAIProvider(settings), aiConfigured: Boolean(settings.apiKey.trim()), serveClient: false });
  }
  return async function handler(req, res) {
    try {
      appPromise ||= initialize();
      const app = await appPromise;
      return app(req, res);
    } catch (error) {
      appPromise = null; // A transient connection failure must not poison this instance.
      res.statusCode = error instanceof AppError ? error.status : 503;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({
        error: error instanceof AppError ? error.message : "Unable to connect to the hosted database. Check the Turso URL and token in Vercel, then retry.",
        code: error instanceof AppError ? error.code : "DATABASE_UNAVAILABLE",
      }));
    }
  };
}
