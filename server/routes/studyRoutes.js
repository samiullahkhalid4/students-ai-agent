import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { AppError } from "../services/errors.js";
import {
  extractLecture,
  sanitizeFilename,
  validateFileType,
} from "../services/fileService.js";
import { MAX_FILE_BYTES } from "../config.js";
import { TASKS } from "../prompts/schemas.js";

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const uploadFields = z.object({
  name: z.string().trim().min(1).max(100),
  subject: z.string().trim().min(1).max(160),
});
const generateFields = z.object({ sessionId: id, task: z.enum(TASKS) });
const quizFields = z.object({
  sessionId: id,
  outputId: id,
  answers: z.array(z.enum(["A", "B", "C", "D"])).length(10),
});
function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success)
    throw new AppError(
      400,
      result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
      "INVALID_INPUT",
    );
  return result.data;
}
const parseId = (value) =>
  validate(id, /^\d+$/.test(value) ? Number(value) : NaN);

export function createStudyRoutes({ memory, controller }) {
  const router = Router();
  // Files stay in a bounded memory buffer and are released after extraction.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_FILE_BYTES,
      files: 1,
      fields: 2,
      fieldSize: 1024,
      parts: 3,
    },
    fileFilter(req, file, done) {
      try {
        validateFileType(file);
        done(null, true);
      } catch (error) {
        done(error);
      }
    },
  });
  router.post("/upload", upload.single("file"), async (req, res) => {
    if (!req.file)
      throw new AppError(
        400,
        "Choose a lecture file before uploading.",
        "MISSING_FILE",
      );
    const { name, subject } = validate(uploadFields, req.body);
    const lectureText = await extractLecture(req.file);
    const session = await memory.saveStudySession({
      name,
      subject,
      filename: sanitizeFilename(req.file.originalname),
      lectureText,
    });
    res.status(201).json({ session });
  });
  router.post("/generate", async (req, res) => {
    const { sessionId, task } = validate(generateFields, req.body);
    res.json(await controller.generate(sessionId, task));
  });
  router.get("/session/:id/status", async (req, res) =>
    res.json(await controller.getStatus(parseId(req.params.id))),
  );
  router.get("/sessions", async (req, res) =>
    res.json({ sessions: await memory.listStudySessions() }),
  );
  router.get("/session/:id/history", async (req, res) => {
    const session = await memory.getStudySession(parseId(req.params.id));
    res.json({ outputs: session.outputs, quizResults: session.quizResults });
  });
  router.get("/session/:id", async (req, res) =>
    res.json({ session: await memory.getStudySession(parseId(req.params.id)) }),
  );
  router.post("/quiz-score", async (req, res) => {
    const { sessionId, outputId, answers } = validate(quizFields, req.body);
    res
      .status(201)
      .json({ result: await memory.saveQuizResult(sessionId, outputId, answers) });
  });
  return router;
}
