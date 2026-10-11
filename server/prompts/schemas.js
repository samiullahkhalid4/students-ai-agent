import { z } from "zod";

const text = z.string().trim().min(1).max(6000);
export const taskSchemas = {
  summary: z
    .object({
      overview: text,
      importantConcepts: z
        .array(z.object({ concept: text, explanation: text }).strict())
        .min(1)
        .max(12),
      keyDefinitions: z
        .array(z.object({ term: text, definition: text }).strict())
        .max(12),
      keyPointsToRemember: z.array(text).min(1).max(12),
    })
    .strict(),
  questions: z
    .object({
      shortQuestions: z.array(text).length(5),
      conceptualQuestions: z.array(text).length(5),
    })
    .strict(),
  mcqs: z
    .object({
      questions: z
        .array(
          z
            .object({
              question: text,
              options: z
                .object({ A: text, B: text, C: text, D: text })
                .strict(),
              correctAnswer: z.enum(["A", "B", "C", "D"]),
              explanation: text,
            })
            .strict(),
        )
        .length(10),
    })
    .strict(),
  revision: z
    .object({
      topics: z
        .array(
          z
            .object({
              topic: text,
              importance: z.enum(["High", "Medium", "Low"]),
              estimatedMinutes: z.number().int().min(5).max(60),
              focus: text,
            })
            .strict(),
        )
        .min(1)
        .max(8),
    })
    .strict(),
};
export const TASKS = Object.keys(taskSchemas);
export const insufficientSchema = z.object({
  insufficientInformation: z.literal(true),
  message: text,
}).strict();
export const generationSchema = (task) => z.union([taskSchemas[task], insufficientSchema]);
export const criticSchema = (task) =>
  z
    .object({
      passed: z.boolean(),
      issues: z.array(text).max(15),
      revisedOutput: taskSchemas[task].nullable(),
    })
    .strict();
export function jsonSchema(schema) {
  const result = z.toJSONSchema(schema);
  delete result.$schema;
  return result;
}
