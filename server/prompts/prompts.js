import { summaryPrompt } from "./summaryPrompt.js";
import { questionPrompt } from "./questionPrompt.js";
import { mcqPrompt } from "./mcqPrompt.js";
import { revisionPrompt } from "./revisionPrompt.js";
export { systemInstruction } from "./systemPrompt.js";
export { reviewPrompt } from "./criticPrompt.js";

const taskInstructions = { summary: summaryPrompt, questions: questionPrompt, mcqs: mcqPrompt, revision: revisionPrompt };

export function executionPrompt(task, session, feedback = null) {
  return `${taskInstructions[task]}\nDo not introduce information absent from the lecture.
If the lecture cannot support the requested task or number of distinct questions, return ONLY {"insufficientInformation": true, "message": "A clear explanation of what lecture material is missing"}. Never pad with duplicates or invent facts.
LECTURE DATA (JSON):\n${JSON.stringify({ subject: session.subject, lecture: session.lecture_text })}
${feedback ? `REVIEW DATA: Fix these issues in one revision:\n${JSON.stringify(feedback)}` : ""}`;
}

