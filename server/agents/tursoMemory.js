import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client/web";
import { AppError } from "../services/errors.js";
import { migrateSources, MAX_SUBJECT_FILES } from "./studySources.js";

const decodeOutput = (row) => ({
  ...row, output: JSON.parse(row.output), metadata: JSON.parse(row.metadata),
});

export async function createTursoMemory({ url, authToken, client = createClient({ url, authToken }) }) {
  // Use the same SQLite tables locally and remotely; filesystem PRAGMAs are local only.
  const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
  const tables = schema.split(";").map((sql) => sql.trim()).filter((sql) => sql.startsWith("CREATE TABLE"));
  await client.batch([...tables, `CREATE TABLE IF NOT EXISTS agent_runs (
    session_id INTEGER PRIMARY KEY REFERENCES study_sessions(id),
    token TEXT NOT NULL, lease_until INTEGER NOT NULL, state TEXT NOT NULL
  )`], "write");
  await client.execute(migrateSources);

  const execute = (sql, args = []) => client.execute({ sql, args });
  async function getStudySession(id) {
    const session = (await execute(`SELECT s.*, st.name AS student_name
      FROM study_sessions s JOIN students st ON st.id = s.student_id WHERE s.id = ?`, [id])).rows[0];
    if (!session) throw new AppError(404, "Study session not found. Upload your lecture to begin.", "SESSION_NOT_FOUND");
    const [outputs, scores, files] = await Promise.all([
      execute("SELECT * FROM generated_outputs WHERE session_id = ? ORDER BY id DESC", [id]),
      execute("SELECT * FROM quiz_results WHERE session_id = ? ORDER BY id DESC", [id]),
      execute("SELECT * FROM lecture_files WHERE session_id = ? ORDER BY id", [id]),
    ]);
    return { ...session, files: files.rows, outputs: outputs.rows.map(decodeOutput), quizResults: scores.rows };
  }
  async function listStudySessions() {
    return (await execute(`SELECT s.id, s.subject, s.filename, s.created_at, st.name AS student_name,
      (SELECT count(*) FROM lecture_files f WHERE f.session_id = s.id) AS file_count
      FROM study_sessions s JOIN students st ON st.id = s.student_id ORDER BY s.id DESC LIMIT 50`)).rows;
  }
  async function saveStudySession({ name, subject, filename, lectureText }) {
    const transaction = await client.transaction("write");
    let sessionId;
    try {
      const student = await transaction.execute({ sql: "INSERT INTO students (name) VALUES (?)", args: [name] });
      const session = await transaction.execute({
        sql: "INSERT INTO study_sessions (student_id, subject, filename, lecture_text) VALUES (?, ?, ?, ?)",
        args: [Number(student.lastInsertRowid), subject, filename, lectureText],
      });
      sessionId = Number(session.lastInsertRowid);
      await transaction.execute({ sql: "INSERT INTO lecture_files (session_id, filename, lecture_text) VALUES (?, ?, ?)",
        args: [sessionId, filename, lectureText] });
      await transaction.commit();
    } finally {
      transaction.close();
    }
    return getStudySession(sessionId);
  }
  async function addStudyFile(sessionId, { filename, lectureText }) {
    const transaction = await client.transaction("write");
    try {
      const session = await transaction.execute({ sql: "SELECT id FROM study_sessions WHERE id = ?", args: [sessionId] });
      if (!session.rows.length) throw new AppError(404, "Subject not found. Choose a saved subject.", "SESSION_NOT_FOUND");
      const files = (await transaction.execute({ sql: "SELECT filename, lecture_text FROM lecture_files WHERE session_id = ?", args: [sessionId] })).rows;
      if (!files.some((file) => file.filename === filename && file.lecture_text === lectureText)) {
        if (files.length >= MAX_SUBJECT_FILES)
          throw new AppError(400, "This subject has 50 files. Use the existing notes to study.", "FILE_LIMIT");
        await transaction.execute({ sql: "INSERT INTO lecture_files (session_id, filename, lecture_text) VALUES (?, ?, ?)",
          args: [sessionId, filename, lectureText] });
      }
      await transaction.commit();
    } finally { transaction.close(); }
    return getStudySession(sessionId);
  }
  async function saveGeneratedOutput(sessionId, task, output, metadata) {
    const result = await execute(`INSERT INTO generated_outputs (session_id, task_type, output, metadata)
      VALUES (?, ?, ?, ?) RETURNING *`, [sessionId, task, JSON.stringify(output), JSON.stringify(metadata)]);
    return decodeOutput(result.rows[0]);
  }
  async function saveQuizResult(sessionId, outputId, answers) {
    await getStudySession(sessionId);
    const row = (await execute("SELECT output FROM generated_outputs WHERE id = ? AND session_id = ? AND task_type = 'mcqs'", [outputId, sessionId])).rows[0];
    if (!row) throw new AppError(404, "This quiz does not belong to the study session.");
    const { questions } = JSON.parse(row.output);
    if (answers.length !== questions.length) throw new AppError(400, "Answer every question before submitting.");
    const score = questions.reduce((count, question, i) => count + Number(question.correctAnswer === answers[i]), 0);
    return (await execute(`INSERT INTO quiz_results (session_id, output_id, score, total)
      VALUES (?, ?, ?, ?) RETURNING *`, [sessionId, outputId, score, questions.length])).rows[0];
  }

  // Durable progress and an expiring lease work across different Vercel instances.
  async function acquireTask(sessionId, state) {
    const token = randomUUID();
    const result = await execute(`INSERT INTO agent_runs (session_id, token, lease_until, state)
      VALUES (?, ?, unixepoch() + 330, ?) ON CONFLICT(session_id) DO UPDATE SET
      token = excluded.token, lease_until = excluded.lease_until, state = excluded.state
      WHERE agent_runs.lease_until <= unixepoch() RETURNING session_id`, [sessionId, token, JSON.stringify(state)]);
    if (!result.rows.length) throw new AppError(409, "This session is already generating. Please wait.", "SESSION_BUSY");
    return token;
  }
  async function saveTaskState(sessionId, token, state, finished = false) {
    await execute(`UPDATE agent_runs SET state = ?, lease_until = CASE WHEN ? THEN 0 ELSE lease_until END
      WHERE session_id = ? AND token = ?`, [JSON.stringify(state), finished ? 1 : 0, sessionId, token]);
  }
  async function getTaskState(sessionId) {
    const row = (await execute("SELECT state, lease_until, unixepoch() AS now FROM agent_runs WHERE session_id = ?", [sessionId])).rows[0];
    if (!row) return null;
    const state = JSON.parse(row.state);
    if (state.status === "running" && row.lease_until <= row.now) {
      return { ...state, status: "error", stage: "Error", trace: [...state.trace, {
        stage: "Error", message: "The previous run timed out. You can generate again.", at: new Date().toISOString(),
      }] };
    }
    return state;
  }
  return { storage: "turso", getStudySession, listStudySessions, saveStudySession, addStudyFile,
    saveGeneratedOutput, saveQuizResult, acquireTask, saveTaskState, getTaskState,
    close: () => client.close() };
}
