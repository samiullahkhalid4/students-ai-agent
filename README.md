# Smart Study Agent for Exam Preparation

A small MS Computer Science classroom project: organize multiple lecture files in one subject and generate a short summary, important questions, 10 interactive MCQs, or a revision plan. A visible, bounded agent workflow plans the task, executes it, validates the structure, and asks a second AI call to check the answer against the original lecture.

## Problem and solution

Students often have lecture notes but need help turning them into useful exam-preparation material. The agent reads a lecture, plans a study task, generates learning material, checks its quality against the source, and returns the accepted result.

## Features

- One study space per subject, with multiple PDF, UTF-8 TXT, or DOCX files. Select several files at once and add more lectures later.
- Study all notes or selected files; saved results and PDFs record the exact source filenames.
- Larger text, a guided three-step flow, simpler progress messages, and quizzes with Back/Next navigation and incorrect-answer review.
- Summary with overview, important concepts, key definitions, and key points to remember.
- Five short questions and five conceptual questions.
- Ten MCQs with four options, correct answers, and explanations revealed after submission.
- Revision topics with High/Medium/Low importance, estimated study time, and focus areas.
- Live agent progress, expandable task plan and execution trace.
- Strict JSON validation, a critic review, and **at most one revision** followed by another review.
- SQLite persistence for students, lectures, outputs, reviews, and quiz scores.
- Last-subject restoration, a picker for the 50 most recent study spaces, saved output tabs and versions, and PDF downloads.
- Explicit insufficient-information responses for lectures too thin to support the task.
- Basic write rate limiting (60 requests/minute per local server process).
- PDF downloads include lecture details, headings, page numbers, and a separate MCQ answer key. PDFs are generated locally in the browser without another AI request.
- Responsive React interface; no heavy UI or agent framework.

## Studying with multiple files

1. Enter your name and subject, select one or more lecture files, and click **Upload my notes**.
2. Reopen the subject from **My subjects → Saved subjects** whenever you want to continue. Use **Add more notes** to upload later lectures into that same study space.
3. Leave **Study all notes** checked, or expand **Select specific files** to choose the material for an activity.
4. Choose **Short summary**, **Practice questions**, **Take a practice quiz**, or **Revision plan**. Each result lists its source files and offers **Download PDF**.
5. Adding notes keeps existing results and quiz scores. Older results display a notice when new files were added afterward. Generate the activity again to include them, and use **Saved versions** to revisit earlier results.

A subject can hold up to **50 files**. Each file supports up to **60,000 extracted characters** (PDFs also have a 100-page limit). One activity can use up to **60,000 combined characters**, including source labels. For a larger subject, select fewer files per activity; content is never silently truncated. Retrying an append with the same filename and extracted text does not duplicate the file.

Existing single-file sessions migrate automatically on startup in both local SQLite and Turso. Their session IDs, generated outputs, and quiz scores are preserved. Old separate sessions remain separate; they are not automatically merged by subject name.

## Stack and requirements

React 19 + Vite, Node.js + Express 5, the official `@google/genai` SDK, Zod, and SQLite. Text extraction uses `pdf-parse` and `mammoth`. The database uses Node's built-in `node:sqlite`; no separate database service or native database installation is needed.

Use **Node.js 22.13 or newer** (tested with 22.20) and npm. Node 22 may print an experimental SQLite warning; that is expected. Python 3 is only needed if you want to regenerate the included sample files.

## Installation and development

From this project's root folder:

```bash
npm install
cp .env.example server/.env
```

Edit **`server/.env`** and add your Gemini API key. Get a key from [Google AI Studio](https://aistudio.google.com/apikey). Then run both applications:

```bash
npm run dev
```

Open **http://127.0.0.1:5173**. The backend runs at **http://127.0.0.1:3001**. Vite proxies `/api` requests to Express, so no frontend API key or CORS setup is needed.

If port 5173 is already occupied, Vite chooses the next available port; open the URL printed in the terminal. If backend port 3001 is occupied, change `PORT` in `server/.env` and the proxy target in `client/vite.config.js` to the same available port.

To run the applications in separate terminals:

```bash
# Terminal 1 — backend
npm run dev:server

# Terminal 2 — frontend
npm run dev:client
```

The upload and saved-session endpoints work without a key. Generation returns an actionable configuration message until a key is set. Restart the backend after editing `.env`.

## Deploy to Vercel with Turso

The React frontend and Express API must both be deployed. `vercel.json` builds `client/dist` and routes `/api/*` to `api/index.js`. The Vercel entry exports a request handler; it does not start a long-running HTTP listener.

Vercel cannot persist a writable local SQLite file across function instances. This deployment uses Turso (hosted SQLite) for lectures, outputs, quiz results, progress, and generation locks. Local `npm run dev` continues using `server/db/study.sqlite`. See [Vercel's SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).

1. Create a database in your [Turso account](https://turso.tech/) and obtain its URL and a read/write auth token. If using the Turso CLI after signing in:

   ```bash
   turso db create students-ai-agent
   turso db show students-ai-agent --url
   turso db tokens create students-ai-agent
   ```

2. In the Vercel project settings, set **Root Directory to the repository root** (leave it empty/default, not `client`). Use **Vite**, **Install Command `npm ci`**, **Build Command `npm run build`**, and **Output Directory `client/dist`**. Use Node.js **22.x** or newer and enable **Fluid compute**. These build commands are also supplied in `vercel.json`.
3. Add the following Vercel environment variables for **Production**, and for **Preview** if needed:

   | Variable | Value |
   | --- | --- |
   | `AI_PROVIDER` | `gemini` |
   | `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
   | `GEMINI_API_KEY` | Your Gemini API key |
   | `TURSO_DATABASE_URL` | The `libsql://…` URL from Turso |
   | `TURSO_AUTH_TOKEN` | Your database read/write token |

   Do not use a `VITE_` prefix for these secrets. Local `server/.env` is intentionally excluded from Git and is not transferred to Vercel. The tables initialize automatically on the first API request; existing local sessions are not automatically uploaded to Turso.
4. Redeploy the latest `main` commit **after changing settings or environment variables**.
5. Open `https://your-project.vercel.app/api/health`. A configured deployment returns JSON with `status: "ok"`, `aiConfigured: true`, and `storage: "turso"`. Then upload the sample PDF and generate a study aid.

Each hosted file upload is capped at **4 MB**, leaving room for multipart fields under [Vercel's 4.5 MB function payload limit](https://vercel.com/docs/functions/limitations). Local uploads remain 10 MB per file. Multi-file selections upload sequentially, keeping each request within the limit. If a file fails, completed uploads stay saved and the remaining files can be retried in the same subject. The function allows up to 300 seconds for the bounded AI loop; choose a hosting configuration that supports that duration. Progress and an expiring per-session lease are persisted in Turso so requests sent to different instances see the same task. If a function is terminated, its lease expires after 330 seconds and the session becomes retryable. Basic write rate limits and the four-run concurrency cap are still per instance.

Troubleshooting:

- **500 / `FUNCTION_INVOCATION_FAILED` with `DOMMatrix is not defined`:** deploy the latest code and keep the PDF worker/canvas entries in `vercel.json`'s `includeFiles`. PDF.js loads native canvas indirectly, so automatic function tracing alone can omit it. The PDF reader is loaded only during PDF uploads, with `pdf-parse/worker` initialized before `pdf-parse`.
- **404/plain-text/HTML from `/api/health`:** the API was not deployed or routed. Check that Vercel's Root Directory is the repository root and that the latest `vercel.json` is included.
- **`MISSING_DATABASE_CONFIG`:** add both Turso variables and redeploy.
- **`DATABASE_UNAVAILABLE`:** check the Turso URL, token permissions/expiry, and database availability.
- **`MISSING_API_KEY`:** add the key to Vercel environment variables and redeploy; a key configured on your laptop is not available to Vercel.
- **413:** use a lecture file under 4 MB on Vercel.

This remains a classroom app with no user authentication. Hosted sessions are shared by anyone who can access the deployment; use Vercel deployment protection for a private class demonstration.

## Environment variables

The root `.env.example` is a template; local configuration is loaded from **`server/.env`**, regardless of the directory from which Node starts. Hosting environment variables take precedence. An identical template is available at `server/.env.example`.

| Variable         | Default                 | Purpose                                                                                    |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| `AI_PROVIDER`    | `gemini`                | Selects the provider adapter. Only Gemini is implemented.                                  |
| `GEMINI_API_KEY` | empty                   | Required for AI generation; keep it on the backend.                                        |
| `GEMINI_MODEL`   | `gemini-3.5-flash-lite` | Configurable Gemini text model with structured output support.                             |
| `PORT`           | `3001`                  | Express port. If changed during development, update the target in `client/vite.config.js`. |
| `HOST`           | `127.0.0.1`             | Local-only binding for this unauthenticated classroom application.                         |
| `DATABASE_PATH`  | `./db/study.sqlite`     | SQLite path relative to `server/`, or an absolute path.                                    |

Never put a key in `client/`, a `VITE_*` variable, a prompt, or version control. `.env` files, SQLite files, uploads, and build artifacts are ignored by Git.

The default model is listed with support for structured output in Google's [Gemini 3.5 Flash-Lite documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), checked October 11, 2026. Model availability depends on your account and may change; update `GEMINI_MODEL` when necessary. See Google's [model catalog](https://ai.google.dev/gemini-api/docs/models) and [structured output guide](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).

## Production-style local run

```bash
npm run build
npm start
```

Open **http://127.0.0.1:3001**. Express serves `client/dist` and the API together. This is still a local classroom application, not a hardened public hosting configuration.

## Agent architecture

```text
User Goal
   ↓
Controller
   ↓
Planner
   ↓
Memory + Tools
   ↓
Executor
   ↓
Observer
   ↓
Critic
   ↓
Pass / Revise
   ↓
Final Study Output
```

| Component   | File                                              | Responsibility                                                                                           |
| ----------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Controller  | `server/agents/controller.js`           | Maintains state, chooses the next step, enforces one revision, saves accepted results, exposes progress. |
| Planner     | `server/agents/planner.js`                        | Creates a small deterministic plan for the selected task.                                                |
| Memory      | `server/agents/memory.js`                         | Implements `saveStudySession()`, `getStudySession()`, output storage, and server-side quiz scoring.      |
| Tools       | `server/tools/fileTools.js`, `studyTools.js` | `extractPdfText()`, `extractDocxText()`, `extractTxtText()`, `generateWithAI()`, and `validateOutput()`.                     |
| Executor    | `server/agents/executor.js`                       | Prepares the task prompt and calls the provider.                                                         |
| Observer    | `server/agents/observer.js`                       | Rejects empty/malformed JSON, invalid schemas, and duplicate questions/options, missing lecture text, and insufficient lecture responses.                      |
| Critic      | `server/agents/critic.js`                         | Uses the same provider and model with a separate grounding, completeness, and clarity prompt.            |
| Environment | Files, SQLite, AI API, student UI                 | The inputs, persistent state, external service, and interface in which the agent operates.               |

This is a **bounded agentic workflow**, not multiple independent autonomous agents. The planner is plain JavaScript; the controller makes an explicit pass/revise decision based on the critic's observation. There is no LangChain, vector database, Docker, authentication layer, or microservice.

### Pass and revision behavior

1. The controller interprets the selected task; the planner chooses its steps. The executor receives the lecture and generates schema-constrained JSON. If the source cannot support the task, an explicit insufficient-information response becomes a readable `422 INSUFFICIENT_LECTURE` error; it is never stored as verified material.
2. The observer checks the result before it reaches the critic.
3. The critic receives the **entire original lecture**, task, and generated output. It returns `{ passed, issues, revisedOutput }`.
4. If accepted, the controller saves the result.
5. If rejected, the controller uses the critic's corrected result, or asks the executor to regenerate once using the issues and previous output.
6. The observer validates the revision, and the critic reviews it again with no revision allowance.
7. If it still fails, the endpoint returns `422 CRITIC_REJECTED`. An unverified answer is never saved as a successful study aid.

A successful first pass costs two AI requests. A revision costs three requests if the critic supplies the corrected output, or four if regeneration is needed. Each provider request has a 60-second timeout and automatic SDK retries are disabled. A failure stops the task; the student may manually try again. Local active runs are process-local. Vercel progress and leases are stored in Turso, but interrupted generation does not resume automatically.

### Gemini and future OpenRouter support

`createGeminiProvider()` implements:

```js
// The adapter object has these fields:
// name: string
// model: string
// generateText(prompt, { schema, systemInstruction }): Promise<string>
```

The SDK call uses `models.generateContent`, a JSON response MIME type, and a JSON Schema derived from Zod. The observer independently validates the response. Lecture content and student metadata are treated as untrusted data in prompts; tools never execute uploaded content.

To add OpenRouter later, create `server/services/openRouterProvider.js` implementing this contract and register it in `createAIProvider()`. Keep any future `OPENROUTER_API_KEY` in `server/.env`. Automatic fallback is **not implemented** in Version 1.

## Folder structure

```text
Student AI Agent/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── FileUpload.jsx
│   │   │   ├── ActionButtons.jsx
│   │   │   ├── LoadingState.jsx
│   │   │   ├── ResultPanel.jsx
│   │   │   ├── SessionHistory.jsx
│   │   │   └── Quiz.jsx
│   │   ├── pages/Home.jsx
│   │   ├── services/{api,pdf}.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── server/
│   ├── agents/{controller,planner,executor,observer,critic,memory,tursoMemory}.js
│   ├── tools/{fileTools,studyTools}.js
│   ├── services/{aiProvider,geminiProvider,fileService,errors,rateLimit}.js
│   ├── routes/studyRoutes.js
│   ├── db/{database.js,schema.sql}
│   ├── prompts/{systemPrompt,summaryPrompt,questionPrompt,mcqPrompt,revisionPrompt,criticPrompt,prompts,schemas}.js
│   ├── tests/{app.test,gemini.test,rateLimit.test,vercel.test,fixtures}.js
│   ├── uploads/.gitkeep
│   ├── vercelApp.js
│   ├── app.js
│   ├── config.js
│   ├── server.js
│   ├── .env.example
│   └── package.json
├── api/index.js
├── vercel.json
├── samples/lecture.{txt,pdf,docx}
├── scripts/{create-samples.py,verify-live.js}
├── e2e/{study.spec,test-server}.js
├── playwright.config.js
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

SQLite creates `server/db/study.sqlite` on first launch. Uploads are buffered in memory up to the 10 MB limit and released after extraction; no original documents or temporary files are written to `uploads/`. Extracted text remains in SQLite.

## API

All error responses have `{ "error": "Useful message", "code": "ERROR_CODE" }`.

| Method | Route                           | Input / behavior                                                            |
| ------ | ------------------------------- | --------------------------------------------------------------------------- |
| GET    | `/api/health`                   | Backend availability and AI configuration status, never the API key.        |
| POST   | `/api/study/upload`             | Multipart fields `name`, `subject`, and one `file`; returns `{ session }`.  |
| POST   | `/api/study/generate`           | JSON `{ sessionId, task, fileIds? }`; omitted `fileIds` uses all subject files. Returns `{ result, state }`. |
| POST   | `/api/study/session/:id/files`   | Multipart `file`; adds a file to the existing subject, returns `{ session }`. |
| GET    | `/api/study/session/:id`        | Returns `{ session }` including file metadata, original lecture text, outputs, and quiz results.    |
| GET    | `/api/study/sessions`           | Lists the 50 most recent sessions without lecture bodies.                   |
| GET    | `/api/study/session/:id/history` | Returns saved outputs and quiz scores.                                      |
| GET    | `/api/study/session/:id/status` | Polls current task state and trace.                                         |
| POST   | `/api/study/quiz-score`         | JSON `{ sessionId, outputId, answers }`; calculates and persists the score. |

Supported tasks: `summary`, `questions`, `mcqs`, `revision`.

```bash
curl -X POST http://127.0.0.1:3001/api/study/upload \
  -F 'name=Ayesha Khan' -F 'subject=Artificial Intelligence' \
  -F 'file=@samples/lecture.pdf'

curl -X POST http://127.0.0.1:3001/api/study/generate \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":1,"task":"summary"}'
```

Use the actual session ID returned from upload. For quiz submission, `answers` is an ordered array of ten letters (`"A"`, `"B"`, `"C"`, `"D"`). `outputId` must refer to an MCQ result in that session. The server never trusts a client-provided score.

### Database

- `students`: id, name.
- `study_sessions`: id, student_id, subject, filename, lecture_text, created_at.
- `lecture_files`: id, session_id, filename, lecture_text, created_at. These rows supply the selected notes for generation; the original session fields remain for compatibility.
- `generated_outputs`: id, session_id, task_type, output (JSON), metadata (JSON: source IDs/names, available file IDs at generation time, critic review, trace, plan, revision count, provider/model), created_at.
- `quiz_results`: id, session_id, output_id, score, total, created_at.

Foreign keys and score constraints are enabled. Queries use prepared statements. Dates are stored as UTC ISO strings. Creating a subject saves a student, session, and first file transactionally; later uploads add only a file row; names are not unique identities. The browser remembers only the active session ID, not API keys or lecture text. The session picker retrieves recent session metadata from SQLite. Creating another subject clears that browser pointer but does not delete earlier SQLite records.

## Agent type classification

| Type | Demonstration in this project |
| --- | --- |
| Goal-Based Agent | A student selects a concrete exam-preparation goal with one of four buttons. |
| Planning Agent | The deterministic planner breaks that task into retrieval, topic analysis, generation, validation, review, and saving. |
| LLM-Based Agent | Gemini understands the task and lecture, identifies concepts, produces the study aid, and evaluates it in a separate critic call. |
| Tool-Using Agent | The controller and executor select file extraction, AI, validation, SQLite retrieval, and persistence functions. This is explicit JavaScript orchestration, not model-native function calling. |
| Lightweight RAG-style grounding | The complete extracted lecture is retrieved from SQLite and supplied as context for every generation and review. Version 1 needs no vector database or embeddings. |

Topic identification is performed within the generation call. It is not a separate topic extraction service. The four buttons are the supported goal interface; this is not an unrestricted chat assistant.

## Why is this an Agent?

This application does more than send a prompt to an LLM and display its answer. It:

1. Receives a study goal.
2. Plans the task.
3. Retrieves an external lecture file's extracted content.
4. Uses tools for extraction, generation, validation, and persistence.
5. Executes the requested action.
6. Observes errors and the result's structure.
7. Evaluates content against the source with a critic.
8. Revises when necessary, with a strict maximum of one revision.
9. Maintains study memory and quiz results in SQLite.

It therefore demonstrates a small goal-based, planning, LLM-based, tool-using agent with a closed feedback loop.

## Classroom demos

**Agentic AI lecture → MCQs:** upload `samples/lecture.pdf`, then choose **Generate MCQs**. The system reads the lecture from memory → identifies important concepts → generates ten MCQs → observes their structure → verifies support and correct answers → revises once if needed → saves and displays accepted questions. Answer the quiz to demonstrate server-side scoring and persistent memory.

**Same lecture → Revision Plan:** choose **Revision Plan**. The executor identifies and groups topics → estimates their importance → orders a study sequence → supplies time estimates and focus areas → the observer and critic check it → the accepted plan appears. The importance ratings are study recommendations, not predictions of an examiner's marks.

## Example student workflow

1. Start the app, enter your name and `Artificial Intelligence` as the subject.
2. Upload `samples/lecture.pdf` (TXT and DOCX equivalents are included).
3. Select **Short Summary** and expand the agent steps to explain the workflow in class.
4. Select **Important Questions** for written exam practice.
5. Select **Generate MCQs**, answer all ten, and choose **Check my answers**. Review explanations and the saved score.
6. Select **Revision Plan** to organize study time.
7. Switch between the saved aid tabs, download a result as PDF, reload to restore the last session, or use **Saved lectures** to reopen an earlier lecture.

## Verification

```bash
# Backend integration tests using temporary SQLite databases and controlled AI responses
npm test

# Compile the real frontend
npm run build

# One-time Chromium download for browser testing
npx playwright install chromium

# Real browser + Express + SQLite; isolated test provider, no Gemini charges
npm run test:e2e
```

Backend tests cover real TXT/PDF/DOCX extraction, all four tasks, passing and failing critic reviews, the single-revision limit, malformed responses, missing API configuration, invalid and oversized uploads, session persistence, concurrency, and quiz scoring. Browser tests cover the full student workflow, saved-session restoration, mobile layout, downloads, and error recovery.

Verification on October 11, 2026: **48 backend/provider tests passed, all 5 browser scenarios passed, and the production build passed.** The hosted database adapter was tested with the libSQL client against temporary local SQLite files, including separate client instances, shared progress, and expiring task leases. A live Turso connection and Vercel end-to-end deployment still require account configuration. Browser checks used an existing local Chromium installation. If you already have a compatible Chromium executable, you can set `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/absolute/path/to/chromium` when running `npm run test:e2e`; otherwise use the browser installation command above.

The test server uses deterministic fixture responses and an in-memory database. It is separate from `server/server.js` and cannot be enabled through the application UI. These tests verify integration and workflow behavior, **not real Gemini content quality or live model access**. To verify those, put your own key in `server/.env` and run the sample workflow or `npm run test:live`. That opt-in script uploads the sample PDF through a temporary local API server, calls real Gemini for all four tasks and critic reviews, checks saved outputs, and closes its isolated in-memory database. It consumes API quota and exits with a clear failure if a task cannot pass review. No key is included in this project.

Regenerate the sample PDF/DOCX, if desired, with `python3 scripts/create-samples.py`.

## Limits and future improvements

- Local, unauthenticated assignment app. Anyone with access to the backend can access sessions. It defaults to loopback; add authentication, authorization, quotas, and production hardening before public deployment.
- Maximum upload: 10 MB locally or 4 MB on Vercel, 100 PDF pages, 60,000 extracted characters. Oversized lectures are rejected rather than silently truncated. DOCX archives are checked for expansion size and entry count.
- Text-based PDF only: no OCR for scanned pages, handwriting, images, or equations. Password-protected or damaged files may not extract. PDF/DOCX layout and tables may lose structure.
- AI can still make mistakes, including in the critic. It may omit topics or struggle to produce ten distinct MCQs from very short notes. Prompt injection protections reduce risk but cannot guarantee factual grounding.
- No live AI validation is possible without a configured Gemini key and quota. Billing and model access are controlled by the Gemini account.
- Quiz answers are part of the saved output/API response and PDF export. The quiz is a self-study aid, not a secure examination system.
- Four simultaneous generations per server process, one per session. Local progress traces are held in memory; Vercel traces use Turso. Accepted output metadata is saved in either mode. No background job queue or restart recovery.
- The picker shows the 50 latest sessions; older sessions remain accessible by ID through the API. There is no search, deletion, or weak-topic tracking yet.
- No OpenRouter adapter yet, no vector retrieval, and no multi-file lecture collection.
- Future improvements: source citations, OCR, lecture chunking, searchable session history and deletion, weak-topic tracking, a selectable fallback provider, learning progress charts, and authentication for multi-user deployment.
