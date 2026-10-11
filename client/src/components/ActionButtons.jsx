import { FileText, ListChecks, CircleHelp, CalendarDays, ArrowUpRight } from "lucide-react";
import { taskLabels } from "./ResultPanel.jsx";

const actions = [
  {
    task: "summary",
    icon: FileText,
    text: "The big ideas, made simple.",
    color: "green",
  },
  {
    task: "questions",
    icon: CircleHelp,
    text: "Know what to prepare for.",
    color: "orange",
  },
  {
    task: "mcqs",
    icon: ListChecks,
    text: "Put your knowledge to the test.",
    color: "blue",
  },
  {
    task: "revision",
    icon: CalendarDays,
    text: "Give your study time a plan.",
    color: "purple",
  },
];
export default function ActionButtons({ session, busy, generating, activeTask, generate }) {
  return (
            <section className="task-section" aria-labelledby="task-heading">
              <div className="task-header">
                <div>
                  <div className="section-label">
                    <span className="step-number">02</span> MAKE IT CLICK
                  </div>
                  <h2 id="task-heading">How would you like to study?</h2>
                </div>
                <span className="task-hint">
                  {session
                    ? "Choose your next step"
                    : "Upload a lecture to begin"}
                </span>
              </div>
              <div className="task-grid">
                {actions.map(({ task, icon: Icon, text, color }) => (
                  <button
                    key={task}
                    type="button"
                    className={`task-card ${color} ${generating && activeTask === task ? "task-active" : ""}`}
                    onClick={() => generate(task)}
                    disabled={!session || busy}
                    aria-label={taskLabels[task]}
                  >
                    <div>
                      <span className="task-icon">
                        <Icon size={21} strokeWidth={1.6} />
                      </span>
                      <ArrowUpRight size={16} className="task-arrow" />
                    </div>
                    <strong>
                      {generating && activeTask === task
                        ? "Working on it…"
                        : taskLabels[task]}
                    </strong>
                    <span>{text}</span>
                  </button>
                ))}
              </div>
            </section>
  );
}
