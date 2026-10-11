import { validateOutput } from "../tools/studyTools.js";
import { generationSchema, criticSchema } from "../prompts/schemas.js";
import { AppError } from "../services/errors.js";

export function observeLecture(lecture) {
  if (typeof lecture !== "string" || !lecture.trim())
    throw new AppError(422, "This session has no readable lecture content. Upload your lecture again.", "MISSING_LECTURE");
}
export function observeOutput(task, raw) {
  const output = validateOutput(raw, generationSchema(task));
  if (output.insufficientInformation) {
    throw new AppError(422, `Not enough lecture information: ${output.message}`, "INSUFFICIENT_LECTURE");
  }
  if (task === "questions") {
    const questions = [...output.shortQuestions, ...output.conceptualQuestions];
    const normalized = questions.map((q) => q.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""));
    if (new Set(normalized).size !== 10)
      throw new AppError(502, "The AI repeated study questions. Please try again.", "INVALID_AI_OUTPUT");
  }
  if (task === "mcqs") {
    const questions = output.questions;
    const normalize = (s) => s.trim().toLowerCase();
    if (
      new Set(questions.map((q) => normalize(q.question))).size !== 10 ||
      questions.some(
        (q) => new Set(Object.values(q.options).map(normalize)).size !== 4,
      )
    ) {
      throw new AppError(
        502,
        "The AI repeated quiz questions or options. Please try again.",
        "INVALID_AI_OUTPUT",
      );
    }
  }
  return output;
}
export function observeReview(task, raw) {
  const review = validateOutput(raw, criticSchema(task));
  if (
    (review.passed &&
      (review.issues.length > 0 || review.revisedOutput !== null)) ||
    (!review.passed && review.issues.length === 0)
  ) {
    throw new AppError(
      502,
      "The critic returned an inconsistent review. Please try again.",
      "INVALID_CRITIC_OUTPUT",
    );
  }
  return review;
}
