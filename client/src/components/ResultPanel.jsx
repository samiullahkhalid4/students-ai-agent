import { BookOpen, CheckCheck, Download, FileText } from "lucide-react";
import Quiz from "./Quiz.jsx";

export const taskLabels = {
  summary: "Short Summary",
  questions: "Important Questions",
  mcqs: "Generate MCQs",
  revision: "Revision Plan",
};
const resultLabels = { ...taskLabels, mcqs: "Practice MCQs" };
function download(result) {
  const blob = new Blob([JSON.stringify(result.output, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `study-${result.task_type}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function ResultPanel({
  result,
  session,
  activeTask,
  onSelectTask,
  busy,
  onScore,
}) {
  const outputs = session?.outputs || [];
  const available = Object.keys(taskLabels).filter((task) =>
    outputs.some((o) => o.task_type === task),
  );
  if (!result)
    return (
      <section className="panel empty-output">
        <div className="empty-illustration" aria-hidden="true">
          <div className="paper paper-back" />
          <div className="paper paper-front">
            <BookOpen size={30} strokeWidth={1.4} />
            <span />
            <span />
            <span />
          </div>
          <span className="small-spark">✦</span>
        </div>
        <span className="eyebrow">LESS OVERWHELM. MORE UNDERSTANDING.</span>
        <h3>
          Your next study breakthrough
          <br />
          starts with your notes.
        </h3>
        <p>
          {session
            ? "Choose a study aid above. Your agent will take it from here."
            : "Upload a lecture and choose a study aid. We’ll help you turn a stack of notes into a clear next step."}
        </p>
        <div className="empty-footer">
          <FileText size={14} /> Based on your material <span>·</span>
          <CheckCheck size={15} /> Reviewed by the critic
        </div>
      </section>
    );
  const output = result.output;
  return (
    <section className="panel output-panel" aria-label="Study result">
      <div className="output-tabs" role="tablist" aria-label="Saved study aids">
        {available.map((task) => (
          <button
            key={task}
            type="button"
            role="tab"
            aria-selected={task === activeTask}
            disabled={busy}
            onClick={() => onSelectTask(task)}
          >
            {resultLabels[task]}
          </button>
        ))}
      </div>
      <div className="output-heading">
        <div>
          <span className="eyebrow">YOUR STUDY AID</span>
          <h2>{resultLabels[result.task_type]}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          title="Download result as JSON"
          aria-label="Download result as JSON"
          onClick={() => download(result)}
        >
          <Download size={18} />
        </button>
      </div>
      <div className="result-meta">
        <span>
          <CheckCheck size={14} /> Critic checked
          {result.metadata.revisionCount ? " · revised once" : ""}
        </span>
        <span>{session.subject}</span>
      </div>
      <div className="output-body">
        {result.task_type === "summary" && (
          <>
            <h3>Overview</h3>
            <p>{output.overview}</p>
            <h3>Important concepts</h3>
            <div className="concept-list">
              {output.importantConcepts.map((item, i) => (
                <div className="concept" key={i}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h4>{item.concept}</h4>
                    <p>{item.explanation}</p>
                  </div>
                </div>
              ))}
            </div>
            <h3>Key definitions</h3>
            {output.keyDefinitions.length ? (
              <dl className="definitions">
                {output.keyDefinitions.map((item, i) => (
                  <div key={i}>
                    <dt>{item.term}</dt>
                    <dd>{item.definition}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>No explicit definitions in this lecture.</p>
            )}
            <h3>Key Points to Remember</h3>
            {output.keyPointsToRemember ? (
              <ul>{output.keyPointsToRemember.map((point, i) => <li key={i}>{point}</li>)}</ul>
            ) : <p>This older summary has no saved key points. Generate a new summary to include them.</p>}
          </>
        )}
        {result.task_type === "questions" && (
          <div className="question-groups">
            {[
              ["Short questions", output.shortQuestions],
              ["Conceptual questions", output.conceptualQuestions],
            ].map(([heading, questions]) => (
              <div key={heading}>
                <h3>
                  {heading}
                  <span>05</span>
                </h3>
                <ol>
                  {questions.map((question, i) => (
                    <li key={i}>{question}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
        {result.task_type === "revision" && (
          <>
            <p className="plan-total">
              A focused plan ·{" "}
              {output.topics.reduce(
                (sum, topic) => sum + topic.estimatedMinutes,
                0,
              )}{" "}
              minutes in total
            </p>
            <div className="revision-topics">
              {output.topics.map((topic, i) => (
                <article key={i}>
                  <span className="topic-number">{i + 1}</span>
                  <div>
                    <h3>{topic.topic}</h3>
                    <p className="muted small">Importance: {topic.importance || "Not rated in this older plan"}</p>
                    <p>{topic.focus}</p>
                  </div>
                  <span className="time-chip">
                    {topic.estimatedMinutes} min
                  </span>
                </article>
              ))}
            </div>
            <p className="muted small">
              Study times and importance ratings are recommendations. Adjust them to your pace.
            </p>
          </>
        )}
        {result.task_type === "mcqs" && (
          <Quiz
            key={result.id}
            result={result}
            sessionId={session.id}
            savedScores={session.quizResults}
            onScore={onScore}
          />
        )}
      </div>
      <p className="output-footnote">
        AI review helps catch errors, but is not a guarantee. Check important
        details against your lecture.
      </p>
    </section>
  );
}
