import { BookOpen, CheckCheck, Download, FileText } from "lucide-react";
import { useState } from "react";
import Quiz from "./Quiz.jsx";
import { downloadStudyPdf } from "../services/pdf.js";

export const taskLabels = {
  summary: "Short summary",
  questions: "Practice questions",
  mcqs: "Take a practice quiz",
  revision: "Revision plan",
};
const resultLabels = { ...taskLabels, mcqs: "Practice quiz" };
export default function ResultPanel({
  result,
  session,
  activeTask,
  onSelectTask,
  onSelectOutput,
  busy,
  onScore,
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  async function download() {
    setExporting(true);
    setExportError("");
    try {
      await downloadStudyPdf(result, session);
    } catch {
      setExportError("Unable to create the PDF. Please try downloading again.");
    } finally {
      setExporting(false);
    }
  }
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
            ? "Your notes are ready. Start with a short summary or choose another activity above."
            : "Create a subject and upload your notes. You can add more lectures to the same subject anytime."}
        </p>
        <div className="empty-footer">
          <FileText size={14} /> Based on your material <span>·</span>
          <CheckCheck size={15} /> AI checked against your notes
        </div>
      </section>
    );
  const output = result.output;
  const legacySources = session.files.slice(0, 1).map(({ id, filename }) => ({ id, filename }));
  const sources = result.metadata.sources || legacySources;
  const knownFiles = result.metadata.availableFileIds || sources.map((source) => source.id);
  const addedFiles = session.files.filter((file) => !knownFiles.includes(file.id));
  const versions = outputs.filter((item) => item.task_type === result.task_type);
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
          className="button secondary download-button"
          title={exporting ? "Preparing PDF…" : "Download result as PDF"}
          aria-label="Download result as PDF"
          aria-busy={exporting}
          disabled={exporting}
          onClick={download}
        >
          <Download size={18} /> Download PDF
        </button>
      </div>
      {exporting && <p className="muted" role="status">Preparing your PDF…</p>}
      {exportError && <p className="field-error" role="alert">{exportError}</p>}
      <div className="result-meta">
        <span>
          <CheckCheck size={14} /> AI checked against your notes
          {result.metadata.revisionCount ? " · revised once" : ""}
        </span>
        <span>{session.subject}</span>
      </div>
      <div className="source-summary">
        <p><strong>Notes used:</strong> {sources.map((source) => source.filename).join(", ")}</p>
        {!!addedFiles.length && <p className="updated-notes" role="status">{addedFiles.length} new {addedFiles.length === 1 ? "file was" : "files were"} added after this result. Choose an activity above to include your new notes.</p>}
        {versions.length > 1 && <label>Saved versions
          <select value={result.id} disabled={busy} onChange={(event) => onSelectOutput(Number(event.target.value))}>
            {versions.map((item, index) => <option key={item.id} value={item.id}>
              {index === 0 ? "Latest" : `Version ${versions.length - index}`} · {new Date(item.created_at).toLocaleString()} · {(item.metadata.sources || legacySources).map((source) => source.filename).join(", ")}
            </option>)}
          </select>
        </label>}
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
