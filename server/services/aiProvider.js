import { createGeminiProvider } from "./geminiProvider.js";
import { AppError } from "./errors.js";

// Provider contract: { name, model, generateText(prompt, { schema, systemInstruction }) }.
// A future OpenRouter adapter can implement this contract without changing agents.
export function createAIProvider(config) {
  if (config.provider === "gemini") return createGeminiProvider(config);
  throw new AppError(
    503,
    `Unsupported AI_PROVIDER. Use gemini; other adapters are not implemented.`,
    "INVALID_PROVIDER",
  );
}
