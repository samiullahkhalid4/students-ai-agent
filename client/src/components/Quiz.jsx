import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { api } from "../services/api.js";

export default function Quiz({ result, sessionId, savedScores = [], onScore }) {
  const questions = result.output.questions;
  const [answers, setAnswers] = useState({});
  const [score, setScore] = useState(null);
  const [current, setCurrent] = useState(0);
  const [reviewMistakes, setReviewMistakes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const questionHeading = useRef(null);
  const answered = Object.keys(answers).length;
  const previous = savedScores.find((saved) => saved.output_id === result.id);
  useEffect(() => { if (current > 0) questionHeading.current?.focus(); }, [current]);
  async function submit(event) {
    event.preventDefault();
    if (answered !== questions.length || saving || score) return;
    setSaving(true);
    setError("");
    try {
      const { result: saved } = await api.quizScore(sessionId, result.id, questions.map((_, index) => answers[index]));
      setScore(saved);
      onScore(saved);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }
  return <form className="quiz" onSubmit={submit}>
    <div className="quiz-intro">
      <p>{score ? "Review your answers and explanations below." : "Take your time. Answers appear after you submit."}</p>
      <span role="status">{score ? `${score.score} / ${score.total} correct` : `${answered} / ${questions.length} answered`}</span>
    </div>
    {!score && <>
      <progress max={questions.length} value={answered} aria-label="Questions answered" />
      <div className="question-navigation" aria-label="Quiz questions">{questions.map((_, index) => <button
        type="button" key={index} disabled={saving} aria-label={`Go to question ${index + 1}${answers[index] ? ", answered" : ""}`}
        aria-current={current === index ? "step" : undefined} className={answers[index] ? "answered" : ""}
        onClick={() => setCurrent(index)}>{index + 1}</button>)}</div>
    </>}
    {previous && !score && <p className="previous-score">Last saved attempt: {previous.score}/{previous.total}</p>}
    {score && <div className="quiz-review-controls">
      <p className="quiz-score-message">{score.score === score.total ? "All correct! You’re ready for another activity." : "Keep going—review the explanations, then give it another try."}</p>
      <label className="source-choice"><input type="checkbox" checked={reviewMistakes}
        onChange={(event) => setReviewMistakes(event.target.checked)} />Show incorrect answers only</label>
      {reviewMistakes && score.score === score.total && <p>No incorrect answers to review.</p>}
    </div>}
    {questions.map((question, index) => {
      if (!score && index !== current) return null;
      if (score && reviewMistakes && answers[index] === question.correctAnswer) return null;
      return <fieldset key={index} className="quiz-question" disabled={Boolean(score) || saving}>
        <legend ref={!score ? questionHeading : undefined} tabIndex={-1}>
          <span>Question {index + 1} of {questions.length}</span>{question.question}
        </legend>
        <div className="quiz-options">{Object.entries(question.options).map(([letter, value]) => <label key={letter}
          className={`quiz-option ${answers[index] === letter ? "selected" : ""} ${score && question.correctAnswer === letter ? "correct" : ""} ${score && answers[index] === letter && question.correctAnswer !== letter ? "incorrect" : ""}`}>
          <input type="radio" name={`question-${result.id}-${index}`} value={letter} checked={answers[index] === letter}
            onChange={() => setAnswers((previousAnswers) => ({ ...previousAnswers, [index]: letter }))} />
          <span className="option-letter">{letter}</span><span>{value}</span>
          {score && question.correctAnswer === letter && <Check size={18} aria-label="Correct answer" />}
          {score && answers[index] === letter && question.correctAnswer !== letter && <X size={18} aria-label="Incorrect answer" />}
        </label>)}</div>
        {score && <p className="explanation"><strong>{answers[index] === question.correctAnswer ? "Correct." : `Your answer: ${answers[index]}.`} Answer {question.correctAnswer}.</strong> {question.explanation}</p>}
      </fieldset>;
    })}
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="quiz-footer">
      {score ? <>
        <strong role="status">Score saved: {score.score}/{score.total}</strong>
        <button type="button" className="button secondary" onClick={() => {
          setScore(null); setAnswers({}); setCurrent(0); setReviewMistakes(false);
        }}><RotateCcw size={16} />Try again</button>
      </> : <>
        <button type="button" className="button secondary" disabled={current === 0 || saving} onClick={() => setCurrent(current - 1)}>Back</button>
        {current < questions.length - 1
          ? <button type="button" className="button primary" disabled={saving} onClick={() => setCurrent(current + 1)}>Next question</button>
          : <button type="submit" className="button primary" disabled={answered !== questions.length || saving}>{saving ? "Saving…" : "Check my answers"}</button>}
      </>}
    </div>
    {!score && <p className="muted small quiz-remaining">{questions.length - answered} questions left. You can go back to change any answer before submitting.</p>}
  </form>;
}
