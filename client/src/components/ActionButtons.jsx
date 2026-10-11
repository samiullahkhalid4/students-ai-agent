import { FileText, ListChecks, CircleHelp, CalendarDays, ArrowUpRight } from "lucide-react";
import { taskLabels } from "./ResultPanel.jsx";

const actions = [
  {
    task: "summary",
    icon: FileText,
    text: "Review the main ideas and key definitions.",
    color: "green",
  },
  {
    task: "questions",
    icon: CircleHelp,
    text: "Practice 10 written questions from your notes.",
    color: "orange",
  },
  {
    task: "mcqs",
    icon: ListChecks,
    text: "Check your understanding with 10 questions.",
    color: "blue",
  },
  {
    task: "revision",
    icon: CalendarDays,
    text: "See what to revise first and how long to spend.",
    color: "purple",
  },
];
export default function ActionButtons({ session, busy, generating, activeTask, generate }) {
  return (
            <section className="task-section" aria-labelledby="task-heading">
              <div className="task-header">
                <div>
                  <div className="section-label">
                    <span className="step-number">2</span> CHOOSE AN ACTIVITY
                  </div>
                  <h2 id="task-heading">How would you like to study?</h2>
                </div>
                <span className="task-hint">
                  {session
                    ? "Choose your next step"
                    : "Upload your notes to begin"}
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
                    {task === "summary" && <span className="start-here">Start here</span>}
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
