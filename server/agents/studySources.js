import { AppError } from "../services/errors.js";
import { MAX_LECTURE_CHARS } from "../config.js";

// Backfill once per existing session, preserving its original source and outputs.
export const migrateSources = `INSERT INTO lecture_files (session_id, filename, lecture_text, created_at)
  SELECT s.id, s.filename, s.lecture_text, s.created_at FROM study_sessions s
  WHERE NOT EXISTS (SELECT 1 FROM lecture_files f WHERE f.session_id = s.id)`;
export const MAX_SUBJECT_FILES = 50;

export function selectSources(session, fileIds) {
  if (fileIds && (!fileIds.length || new Set(fileIds).size !== fileIds.length))
    throw new AppError(400, "Select at least one file, without duplicates.", "INVALID_FILES");
  const files = fileIds ? session.files.filter((file) => fileIds.includes(file.id)) : session.files;
  if (!files.length || (fileIds && files.length !== fileIds.length))
    throw new AppError(400, "Choose files that belong to this subject.", "INVALID_FILES");
  if (files.some((file) => !file.lecture_text.trim()))
    throw new AppError(422, "A selected file has no readable notes. Upload it again.", "MISSING_LECTURE");
  const text = files.length === 1 ? files[0].lecture_text : files.map((file, index) =>
    `Source ${index + 1}: ${file.filename}\n${file.lecture_text}`).join("\n\n");
  if (text.length > MAX_LECTURE_CHARS)
    throw new AppError(400, "These notes are too long to study together. Select fewer files (up to 60,000 characters per activity).", "SELECTION_TOO_LONG");
  return { ...session, lecture_text: text, filename: files.map((file) => file.filename).join(", "),
    sources: files.map(({ id, filename }) => ({ id, filename })) };
}
