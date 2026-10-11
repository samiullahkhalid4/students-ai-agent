import { planTask } from "./planner.js";
import { executeTask } from "./executor.js";
import { observeOutput, observeLecture } from "./observer.js";
import { critiqueOutput } from "./critic.js";
import { AppError } from "../services/errors.js";
import { selectSources } from "./studySources.js";

export function createAgentController({ memory, provider }) {
  const states = new Map();
  const activeSessions = new Set();
  async function getStatus(sessionId) {
    await memory.getStudySession(sessionId);
    if (memory.getTaskState) {
      const saved = await memory.getTaskState(sessionId);
      if (saved) return saved;
    }
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
  async function generate(sessionId, task, fileIds) {
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
    let leaseToken;
    const step = async (stage, message) => {
      state.stage = stage;
      state.trace.push({ stage, message, at: new Date().toISOString() });
      if (leaseToken) await memory.saveTaskState(sessionId, leaseToken, state);
    };
    states.set(sessionId, state);
    activeSessions.add(sessionId);
    try {
      const snapshot = await memory.getStudySession(sessionId);
      const session = selectSources(snapshot, fileIds);
      if (memory.acquireTask) leaseToken = await memory.acquireTask(sessionId, state);
      await step("Controller", "Accepted your study goal.");
      await step("Planner", "Prepared a plan for this task.");
      await step("Memory + Tools", "Loaded extracted lecture text from SQLite.");
      observeLecture(session.lecture_text);
      await step("Executor", "Generating a study aid from your lecture.");
      let output = observeOutput(
        task,
        await executeTask(provider, task, session),
      );
      await step("Observer", "Output is present and matches the expected structure.");
      await step("Critic", "Checking clarity, coverage, and lecture grounding.");
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
        await step("Revise", `One revision requested: ${review.issues.join(" ")}`);
        const revised =
          review.revisedOutput === null
            ? await executeTask(provider, task, session, {
                issues: review.issues,
                previousOutput: output,
              })
            : JSON.stringify(review.revisedOutput);
        output = observeOutput(task, revised);
        await step("Observer", "Revised output matches the expected structure.");
        await step("Critic", "Checking the revised result against the lecture.");
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
      await step("Pass", "Critic accepted the result. Saving to SQLite.");
      const saved = await memory.saveGeneratedOutput(sessionId, task, output, {
        provider: provider.name,
        model: provider.model,
        sources: session.sources,
        availableFileIds: snapshot.files.map((file) => file.id),
        revisionCount: state.revisionCount,
        critic: { passed: true, issues: [], initialIssues: firstIssues },
        plan,
        trace: [...state.trace],
      });
      await step("Complete", "Your study aid is ready and saved.");
      state.status = "complete";
      return { result: saved, state };
    } catch (error) {
      state.status = "error";
      try { await step(
        "Error",
        error instanceof AppError
          ? error.message
          : "Unable to complete the task. Please try again.",
      ); } catch { /* Keep the original error if progress persistence also fails. */ }
      throw error;
    } finally {
      activeSessions.delete(sessionId);
      if (leaseToken) {
        try { await memory.saveTaskState(sessionId, leaseToken, state, true); }
        catch { /* A crashed or disconnected run becomes retryable when its lease expires. */ }
      }
    }
  }
  return { generate, getStatus };
}
