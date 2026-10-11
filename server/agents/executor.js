import { generateWithAI } from "../tools/studyTools.js";
import { executionPrompt, systemInstruction } from "../prompts/prompts.js";
import { generationSchema, jsonSchema } from "../prompts/schemas.js";

export function executeTask(provider, task, session, feedback) {
  return generateWithAI(provider, executionPrompt(task, session, feedback), {
    schema: jsonSchema(generationSchema(task)),
    systemInstruction,
  });
}
