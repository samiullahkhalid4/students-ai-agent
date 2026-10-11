import { generateWithAI } from "../tools/studyTools.js";
import { reviewPrompt, systemInstruction } from "../prompts/prompts.js";
import { criticSchema, jsonSchema } from "../prompts/schemas.js";
import { observeReview } from "./observer.js";

export async function critiqueOutput(
  provider,
  task,
  lecture,
  output,
  allowRevision,
) {
  const raw = await generateWithAI(
    provider,
    reviewPrompt(task, lecture, output, allowRevision),
    {
      schema: jsonSchema(criticSchema(task)),
      systemInstruction,
    },
  );
  return observeReview(task, raw);
}
