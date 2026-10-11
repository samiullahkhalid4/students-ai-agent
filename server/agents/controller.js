import { planTask } from "./planner.js";
import { executeTask } from "./executor.js";
import { observeOutput, observeLecture } from "./observer.js";
import { critiqueOutput } from "./critic.js";
import { AppError } from "../services/errors.js";

export function createAgentController({ memory, provider }) {
  const states = new Map();
  const activeSessions = new Set();
  function getStatus(sessionId) {
    memory.getStudySession(sessionId);
    return (
      states.get(sessionId) || {
        status: "idle",
        stage: "Ready",
        trace: [],
        plan: [],
        revisionCount: 0,
      }
    );
  }
  async function generate(sessionId, task) {
    const plan = planTask(task);
    if (activeSessions.has(sessionId))
      throw new AppError(
        409,
        "This session is already generating. Please wait.",
        "SESSION_BUSY",
      );
    if (activeSessions.size >= 4)
      throw new AppError(
        429,
        "The agent is busy. Please try again shortly.",
        "AGENT_BUSY",
      );
    const session = memory.getStudySession(sessionId);
    // Only recent status traces are held in memory; completed results live in SQLite.
    for (const [id, state] of states) {
      if (states.size < 100) break;
      if (state.status !== "running") states.delete(id);
    }
    const state = {
      status: "running",
      stage: "Controller",
      task,
      plan,
      trace: [],
      revisionCount: 0,
    };
    const step = (stage, message) => {
      state.stage = stage;
      state.trace.push({ stage, message, at: new Date().toISOString() });
    };
    states.set(sessionId, state);
    activeSessions.add(sessionId);
    try {
      step("Controller", "Accepted your study goal.");
      step("Planner", "Prepared a plan for this task.");
      step("Memory + Tools", "Loaded extracted lecture text from SQLite.");
      observeLecture(session.lecture_text);
      step("Executor", "Generating a study aid from your lecture.");
      let output = observeOutput(
        task,
        await executeTask(provider, task, session),
      );
      step("Observer", "Output is present and matches the expected structure.");
      step("Critic", "Checking clarity, coverage, and lecture grounding.");
      let review = await critiqueOutput(
        provider,
        task,
        session.lecture_text,
        output,
        true,
      );
      const firstIssues = review.issues;
      if (!review.passed) {
        state.revisionCount = 1;
        step("Revise", `One revision requested: ${review.issues.join(" ")}`);
        const revised =
          review.revisedOutput === null
            ? await executeTask(provider, task, session, {
                issues: review.issues,
                previousOutput: output,
              })
            : JSON.stringify(review.revisedOutput);
        output = observeOutput(task, revised);
        step("Observer", "Revised output matches the expected structure.");
        step("Critic", "Checking the revised result against the lecture.");
        review = await critiqueOutput(
          provider,
          task,
          session.lecture_text,
          output,
          false,
        );
        if (!review.passed)
          throw new AppError(
            422,
            `The result still failed the lecture check after one revision: ${review.issues.join(" ")} Try a more focused lecture or generate again.`,
            "CRITIC_REJECTED",
          );
      }
      step("Pass", "Critic accepted the result. Saving to SQLite.");
      const saved = memory.saveGeneratedOutput(sessionId, task, output, {
        provider: provider.name,
        model: provider.model,
        revisionCount: state.revisionCount,
        critic: { passed: true, issues: [], initialIssues: firstIssues },
        plan,
        trace: [...state.trace],
      });
      step("Complete", "Your study aid is ready and saved.");
      state.status = "complete";
      return { result: saved, state };
    } catch (error) {
      state.status = "error";
      step(
        "Error",
        error instanceof AppError
          ? error.message
          : "Unable to complete the task. Please try again.",
      );
      throw error;
    } finally {
      activeSessions.delete(sessionId);
    }
  }
  return { generate, getStatus };
}
