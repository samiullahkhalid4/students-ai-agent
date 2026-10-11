import { TASKS } from "../prompts/schemas.js";
import { AppError } from "../services/errors.js";

export function planTask(task) {
  if (!TASKS.includes(task))
    throw new AppError(
      400,
      "Choose summary, questions, mcqs, or revision.",
      "INVALID_TASK",
    );
  const activities = {
    summary: ["Identify core concepts", "Summarize and define key terms"],
    questions: [
      "Identify exam-worthy concepts",
      "Write 5 short and 5 conceptual questions",
    ],
    mcqs: [
      "Identify important concepts",
      "Create 10 questions with answer explanations",
    ],
    revision: ["Group lecture topics", "Estimate study time and focus areas"],
  };
  return [
    "Read lecture from memory",
    ...activities[task],
    "Validate output structure",
    "Check grounding with critic",
    "Revise once if needed",
    "Save verified result",
  ];
}
