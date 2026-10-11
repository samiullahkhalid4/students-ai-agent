import { Check, LoaderCircle, Route, ChevronDown } from "lucide-react";
const stages = ["Planner", "Executor", "Observer", "Critic"];
export default function LoadingState({ state, busy }) {
  const trace = state?.trace || [];
  return (
    <section
      className={`agent-panel ${busy ? "working" : ""}`}
      aria-label="Agent workflow"
    >
      <div className="agent-title">
        <Route size={17} />
        <strong>Your study agent at work</strong>
        <span>
          {busy
            ? "WORKING"
            : state?.status === "complete"
              ? "COMPLETE"
              : state?.status === "error"
                ? "STOPPED"
                : "THE PROCESS"}
        </span>
      </div>
      <div className="agent-stages">
        {stages.map((stage, i) => {
          const seen = trace.some((t) => t.stage === stage);
          const active = busy && state?.stage === stage;
          return (
            <div className={`agent-stage ${seen ? "seen" : ""}`} key={stage}>
              <span className="stage-marker">
                {active ? (
                  <LoaderCircle size={12} className="spin" />
                ) : seen ? (
                  <Check size={12} />
                ) : (
                  i + 1
                )}
              </span>
              {stage}
              {i < stages.length - 1 && <span className="stage-line" />}
            </div>
          );
        })}
      </div>
      <p className="agent-message" role="status" aria-live="polite">
        {busy
          ? trace.at(-1)?.message || "Starting your study task…"
          : state?.status === "complete"
            ? `Checked against your lecture${state.revisionCount ? " after one revision" : ""} and saved.`
            : state?.status === "error"
              ? "The task stopped. See the error above for details."
              : "Plans the task, creates your aid, then checks it against your notes."}
      </p>
      {!!trace.length && (
        <details className="trace">
          <summary>
            View agent workflow steps <ChevronDown size={14} />
          </summary>
          {state.plan?.length > 0 && (
            <div className="plan">
              <strong>Task plan</strong>
              <ol>
                {state.plan.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          )}
          <ol>
            {trace.map((event, i) => (
              <li key={i}>
                <strong>{event.stage}</strong>
                <span>{event.message}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
