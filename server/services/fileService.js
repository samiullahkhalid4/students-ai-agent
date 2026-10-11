import path from "node:path";
import { extractPdfText, extractDocxText, extractTxtText } from "../tools/fileTools.js";
import { AppError } from "./errors.js";
import { MAX_LECTURE_CHARS } from "../config.js";

export const acceptedTypes = {
  ".pdf": ["application/pdf"],
  ".txt": ["text/plain"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
};
export function sanitizeFilename(name) {
  return (
    path
      .basename(name.replaceAll("\\", "/"))
      .replace(/[^\p{L}\p{N}._ -]/gu, "_")
      .slice(-180) || "lecture.txt"
  );
}
export function validateFileType(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  if (
    !acceptedTypes[extension] ||
    ![...acceptedTypes[extension], "application/octet-stream"].includes(
      file.mimetype,
    )
  ) {
    throw new AppError(
      400,
      "Upload a PDF, TXT, or DOCX lecture file.",
      "UNSUPPORTED_FILE",
    );
  }
  return extension;
}
export async function extractLecture(file) {
  const extension = validateFileType(file);
  let text;
  try {
    const extractors = {
      ".pdf": extractPdfText,
      ".docx": extractDocxText,
      ".txt": extractTxtText,
    };
    text = await extractors[extension](file.buffer);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      400,
      "Unable to read this document. It may be damaged or password-protected. Try exporting it as TXT.",
      "EXTRACTION_FAILED",
    );
  }
  text = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text)
    throw new AppError(
      400,
      "No readable text found. Scanned PDFs need OCR first; try a text-based PDF or TXT file.",
      "EMPTY_LECTURE",
    );
  if (text.length > MAX_LECTURE_CHARS)
    throw new AppError(
      400,
      "This lecture exceeds 60,000 characters. Split it into smaller files; text is never silently truncated.",
      "LECTURE_TOO_LONG",
    );
  return text;
}
