import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { api } from "../services/api.js";

export default function Quiz({ result, sessionId, savedScores = [], onScore }) {
  const questions = result.output.questions;
  const [answers, setAnswers] = useState({});
  const [score, setScore] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const answered = Object.keys(answers).length;
  const previous = savedScores.find((s) => s.output_id === result.id);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { result: saved } = await api.quizScore(
        sessionId,
        result.id,
        questions.map((_, i) => answers[i]),
      );
      setScore(saved);
      onScore(saved);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="quiz" onSubmit={submit}>
      <div className="quiz-intro">
        <p>
          {score
            ? "Review your answers below."
            : "Test yourself first. Answers appear after you submit."}
        </p>
        <span>
          {score
            ? `${score.score} / ${score.total} correct`
            : `${answered} / 10 answered`}
        </span>
      </div>
      {previous && !score && (
        <p className="previous-score">
          Last saved attempt: {previous.score}/{previous.total}
        </p>
      )}
      {questions.map((question, index) => (
        <fieldset
          key={index}
          className="quiz-question"
          disabled={Boolean(score) || saving}
        >
          <legend>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {question.question}
          </legend>
          <div className="quiz-options">
            {Object.entries(question.options).map(([letter, value]) => (
              <label
                key={letter}
                className={`quiz-option ${answers[index] === letter ? "selected" : ""} ${score && question.correctAnswer === letter ? "correct" : ""} ${score && answers[index] === letter && question.correctAnswer !== letter ? "incorrect" : ""}`}
              >
                <input
                  type="radio"
                  name={`question-${result.id}-${index}`}
                  value={letter}
                  checked={answers[index] === letter}
                  onChange={() =>
                    setAnswers((a) => ({ ...a, [index]: letter }))
                  }
                />
                <span className="option-letter">{letter}</span>
                <span>{value}</span>
                {score && question.correctAnswer === letter && (
                  <Check size={16} />
                )}
              </label>
            ))}
          </div>
          {score && (
            <p className="explanation">
              <strong>Answer {question.correctAnswer}.</strong>{" "}
              {question.explanation}
            </p>
          )}
        </fieldset>
      ))}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="quiz-footer">
        {score ? (
          <>
            <strong>
              Score saved: {score.score}/{score.total}
            </strong>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setScore(null);
                setAnswers({});
              }}
            >
              <RotateCcw size={15} /> Try again
            </button>
          </>
        ) : (
          <>
            <span>{10 - answered} questions left</span>
            <button
              className="button primary"
              disabled={answered !== 10 || saving}
            >
              {saving ? "Saving…" : "Check my answers"}
            </button>
          </>
        )}
      </div>
    </form>
  );
}
