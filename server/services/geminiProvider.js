import { GoogleGenAI } from "@google/genai";
import { AppError } from "./errors.js";

export function createGeminiProvider({ apiKey, model }) {
  // Lazy construction allows uploads and saved-session access without a key.
  let client;
  return {
    name: "gemini",
    model,
    async generateText(prompt, { schema, systemInstruction }) {
      if (!apiKey.trim())
        throw new AppError(
          503,
          "Gemini is not configured. Add GEMINI_API_KEY to server/.env and restart the backend.",
          "MISSING_API_KEY",
        );
      // In the installed SDK, omitting retryOptions uses one fetch and preserves
      // HTTP status codes; its retry wrapper discards those codes even at one attempt.
      client ||= new GoogleGenAI({ apiKey, httpOptions: { timeout: 60000 } });
      try {
        const response = await client.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseJsonSchema: schema,
            maxOutputTokens: 12000,
          },
        });
        const candidate = response.candidates?.[0];
        if (candidate?.finishReason && candidate.finishReason !== "STOP") {
          throw new AppError(
            502,
            "Gemini could not finish a usable response. Try a shorter lecture or try again.",
            "INCOMPLETE_AI_OUTPUT",
          );
        }
        return response.text || "";
      } catch (error) {
        if (error instanceof AppError) throw error;
        const status = Number(error.status || error.code);
        if (status === 429)
          throw new AppError(
            429,
            "Gemini quota or rate limit reached. Check your API quota and try again later.",
            "AI_RATE_LIMIT",
          );
        if (status === 400 || status === 401 || status === 403)
          throw new AppError(
            502,
            "Gemini rejected the request. Check the backend API key, model access, and account configuration.",
            "AI_CONFIGURATION",
          );
        if (status === 404)
          throw new AppError(
            502,
            "Gemini model unavailable. Set GEMINI_MODEL to a supported model in server/.env.",
            "AI_MODEL_UNAVAILABLE",
          );
        throw new AppError(
          502,
          "Unable to reach Gemini or the request timed out. Please try again.",
          "AI_UNAVAILABLE",
        );
      }
    },
  };
}
