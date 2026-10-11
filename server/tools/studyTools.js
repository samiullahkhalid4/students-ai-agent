import { AppError } from "../services/errors.js";

export function generateWithAI(provider, prompt, options) {
  return provider.generateText(prompt, options);
}

export function validateOutput(raw, schema) {
  if (typeof raw !== "string" || !raw.trim())
    throw new AppError(
      502,
      "The AI returned an empty response. Please try again.",
      "EMPTY_AI_OUTPUT",
    );
  let data;
  try {
    // Accept a single JSON code fence as a courtesy to future providers.
    data = JSON.parse(
      raw
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, ""),
    );
  } catch {
    throw new AppError(
      502,
      "The AI returned malformed JSON. Please try generating again.",
      "MALFORMED_AI_JSON",
    );
  }
  const result = schema.safeParse(data);
  if (!result.success)
    throw new AppError(
      502,
      "The AI response did not match the required format. Please try again.",
      "INVALID_AI_OUTPUT",
    );
  return result.data;
}
