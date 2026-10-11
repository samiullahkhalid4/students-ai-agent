import { AppError } from "../services/errors.js";

const decodeOutput = (row) => ({
  ...row,
  output: JSON.parse(row.output),
  metadata: JSON.parse(row.metadata),
});

export function createMemory(db) {
  function listStudySessions() {
    return db.prepare(`SELECT s.id, s.subject, s.filename, s.created_at,
      st.name AS student_name FROM study_sessions s
      JOIN students st ON st.id = s.student_id ORDER BY s.id DESC LIMIT 50`).all();
  }
  function saveStudySession({ name, subject, filename, lectureText }) {
    let sessionId;
    db.exec("BEGIN");
    try {
      const student = db
        .prepare("INSERT INTO students (name) VALUES (?)")
        .run(name);
      const session = db
        .prepare(
          `INSERT INTO study_sessions
        (student_id, subject, filename, lecture_text) VALUES (?, ?, ?, ?)`,
        )
        .run(student.lastInsertRowid, subject, filename, lectureText);
      sessionId = Number(session.lastInsertRowid);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return getStudySession(sessionId);
  }
  function getStudySession(id) {
    const session = db
      .prepare(
        `SELECT s.*, st.name AS student_name FROM study_sessions s
      JOIN students st ON s.student_id = st.id WHERE s.id = ?`,
      )
      .get(id);
    if (!session)
      throw new AppError(
        404,
        "Study session not found. Upload your lecture to begin.",
        "SESSION_NOT_FOUND",
      );
    const outputs = db
      .prepare(
        "SELECT * FROM generated_outputs WHERE session_id = ? ORDER BY id DESC",
      )
      .all(id)
      .map(decodeOutput);
    const quizResults = db
      .prepare(
        "SELECT * FROM quiz_results WHERE session_id = ? ORDER BY id DESC",
      )
      .all(id);
    return { ...session, outputs, quizResults };
  }
  function saveGeneratedOutput(sessionId, task, output, metadata) {
    const saved = db
      .prepare(
        "INSERT INTO generated_outputs (session_id, task_type, output, metadata) VALUES (?, ?, ?, ?)",
      )
      .run(sessionId, task, JSON.stringify(output), JSON.stringify(metadata));
    return decodeOutput(
      db
        .prepare("SELECT * FROM generated_outputs WHERE id = ?")
        .get(saved.lastInsertRowid),
    );
  }
  function saveQuizResult(sessionId, outputId, answers) {
    getStudySession(sessionId);
    const row = db
      .prepare(
        "SELECT * FROM generated_outputs WHERE id = ? AND session_id = ? AND task_type = 'mcqs'",
      )
      .get(outputId, sessionId);
    if (!row)
      throw new AppError(
        404,
        "This quiz does not belong to the study session.",
      );
    const { questions } = JSON.parse(row.output);
    if (answers.length !== questions.length)
      throw new AppError(400, "Answer every question before submitting.");
    const score = questions.reduce(
      (count, question, i) =>
        count + Number(question.correctAnswer === answers[i]),
      0,
    );
    const saved = db
      .prepare(
        "INSERT INTO quiz_results (session_id, output_id, score, total) VALUES (?, ?, ?, ?)",
      )
      .run(sessionId, outputId, score, questions.length);
    return db
      .prepare("SELECT * FROM quiz_results WHERE id = ?")
      .get(saved.lastInsertRowid);
  }
  return { saveStudySession, getStudySession, listStudySessions, saveGeneratedOutput, saveQuizResult };
}
