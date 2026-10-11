import { Check, LoaderCircle, ChevronDown } from "lucide-react";
const activityNames = { summary: "summary", questions: "practice questions", mcqs: "practice quiz", revision: "revision plan" };
export default function LoadingState({ state, busy }) {
  if (!state && !busy) return null;
  const trace = state?.trace || [];
  const checking = ["Observer", "Critic", "Revise", "Pass"].includes(state?.stage);
  const message = busy
    ? checking ? "Checking against your notes…" : `Creating your ${activityNames[state?.task] || "study aid"}…`
    : state?.status === "complete" ? "Your study aid is ready and saved."
    : state?.status === "error" ? "We couldn’t finish this activity. Check the message above and try again."
    : "Getting your notes ready…";
  return <section className={`agent-panel ${busy ? "working" : ""}`} aria-label="Study progress">
    <div className="agent-title">
      {busy ? <LoaderCircle className="spin" size={20} /> : state?.status === "complete" ? <Check size={20} /> : null}
      <strong role="status" aria-live="polite">{message}</strong>
    </div>
    {!!trace.length && <details className="trace">
      <summary>Technical details <ChevronDown size={16} /></summary>
      {!!state.plan?.length && <div className="plan"><strong>Task plan</strong><ol>{state.plan.map((step) => <li key={step}>{step}</li>)}</ol></div>}
      <ol>{trace.map((event, index) => <li key={index}><strong>{event.stage}</strong><span>{event.message}</span></li>)}</ol>
    </details>}
  </section>;
}
