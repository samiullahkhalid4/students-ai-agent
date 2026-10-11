import ActionButtons from "../components/ActionButtons.jsx";
import SessionHistory from "../components/SessionHistory.jsx";
import SourcePicker, { selectionSize } from "../components/SourcePicker.jsx";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  AlertCircle,
  X,
  GraduationCap,
} from "lucide-react";
import FileUpload from "../components/FileUpload.jsx";
import LoadingState from "../components/LoadingState.jsx";
import ResultPanel from "../components/ResultPanel.jsx";
import { api } from "../services/api.js";

function storedSession() {
  try {
    return localStorage.getItem("study-session-id");
  } catch {
    return null;
  }
}
function storeSession(id) {
  try {
    id
      ? localStorage.setItem("study-session-id", String(id))
      : localStorage.removeItem("study-session-id");
  } catch {
    /* Storage may be disabled; the current session still works. */
  }
}
export default function Home() {
  const [session, setSession] = useState(null);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeTask, setActiveTask] = useState("summary");
  const [agentState, setAgentState] = useState(null);
  const [uploadKey, setUploadKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [uploadProgress, setUploadProgress] = useState("");
  const [selectedOutputId, setSelectedOutputId] = useState(null);
  const pollTimer = useRef(null);
  const pollVersion = useRef(0);
  const busy = uploading || generating || restoring;
  const selectionTooLong = selectionSize(session?.files || [], selectedIds) > 60000;
  const result = session?.outputs.find((output) => output.id === selectedOutputId) || session?.outputs.find(
    (output) => output.task_type === activeTask,
  );
  useEffect(() => {
    setSelectedIds(session?.files.map((file) => file.id) || []);
  }, [session?.id, session?.files.length]);

  useEffect(() => {
    let mounted = true;
    api
      .health()
      .then((value) => {
        if (mounted) setHealth(value);
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      });
    const id = storedSession();
    async function restore() {
      try {
        if (id && /^\d+$/.test(id)) {
          const { session: saved } = await api.session(id);
          if (mounted) {
            setSession(saved);
            setActiveTask(saved.outputs[0]?.task_type || "summary");
            if (saved.outputs[0])
              setAgentState({
                status: "complete",
                stage: "Complete",
                ...saved.outputs[0].metadata,
              });
          }
        }
      } catch (e) {
        if (mounted)
          setError(`Could not restore your last session. ${e.message}`);
      } finally {
        if (mounted) setRestoring(false);
      }
    }
    restore();
    return () => {
      mounted = false;
      pollVersion.current++;
      clearTimeout(pollTimer.current);
    };
  }, []);

  async function upload({ files, name, subject }) {
    setUploading(true);
    setError("");
    let saved = session;
    let completed = 0;
    try {
      for (const file of files) {
        setUploadProgress(`Uploading ${completed + 1} of ${files.length}…`);
        const data = new FormData();
        data.append("file", file);
        if (!saved) { data.append("name", name); data.append("subject", subject); }
        const response = saved ? await api.addFile(saved.id, data) : await api.upload(data);
        saved = response.session;
        completed++;
        setSession(saved);
        storeSession(saved.id);
      }
      if (!session) { setAgentState(null); setActiveTask("summary"); setSelectedOutputId(null); }
    } catch (e) {
      setError(`${completed} of ${files.length} files saved. ${files[completed].name}: ${e.message} Your saved files are kept. Retry the remaining files below.`);
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
    return files.slice(completed);
  }
  async function openSession(id) {
    if (busy) return;
    setRestoring(true);
    setError("");
    try {
      const { session: saved } = await api.session(id);
      setSession(saved);
      setSelectedOutputId(null);
      setUploadKey((key) => key + 1);
      storeSession(saved.id);
      setActiveTask(saved.outputs[0]?.task_type || "summary");
      setAgentState(saved.outputs[0] ? {
        status: "complete", stage: "Complete", ...saved.outputs[0].metadata,
      } : null);
    } catch (e) {
      setError(e.message);
    } finally {
      setRestoring(false);
    }
  }
  function selectTask(task) {
    setSelectedOutputId(null);
    setActiveTask(task);
    const saved = session.outputs.find((output) => output.task_type === task);
    if (saved)
      setAgentState({
        status: "complete",
        stage: "Complete",
        ...saved.metadata,
      });
  }
  async function generate(task) {
    if (!session || busy || !selectedIds.length || selectionTooLong) return;
    setSelectedOutputId(null);
    setGenerating(true);
    setActiveTask(task);
    setError("");
    setAgentState({
      status: "running",
      stage: "Controller",
      task,
      trace: [],
      plan: [],
    });
    const version = ++pollVersion.current;
    async function poll() {
      try {
        const state = await api.status(session.id);
        if (version === pollVersion.current) setAgentState(state);
      } catch {
        /* Generation request reports definitive errors. */
      }
      if (version === pollVersion.current)
        pollTimer.current = setTimeout(poll, 800);
    }
    pollTimer.current = setTimeout(poll, 350);
    try {
      const { result: saved, state } = await api.generate(session.id, task, selectedIds);
      pollVersion.current++;
      clearTimeout(pollTimer.current);
      setSession((current) => ({
        ...current,
        outputs: [saved, ...current.outputs],
      }));
      setAgentState(state);
    } catch (e) {
      pollVersion.current++;
      clearTimeout(pollTimer.current);
      setError(e.message);
      try {
        setAgentState({ ...(await api.status(session.id)), status: "error" });
      } catch {
        setAgentState({ status: "error", trace: [] });
      }
    } finally {
      setGenerating(false);
    }
  }
  function reset() {
    setSelectedOutputId(null);
    setSession(null);
    storeSession(null);
    setAgentState(null);
    setError("");
    setUploadKey((key) => key + 1);
  }
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Smart Study Agent home">
          <span className="brand-mark">
            <BookOpen size={22} />
          </span>
          <span>
            Smart Study<span className="brand-light"> Agent</span>
          </span>
        </a>
        <span className="header-tag">
          <GraduationCap size={16} /> A little help for your next exam
        </span>
      </header>
      <main>
        <section className="hero">
          <div>
            <div className="eyebrow hero-eyebrow">
              <span className="status-dot" /> YOUR PERSONAL STUDY COMPANION
            </div>
            <h1>
              Your notes. Your subjects.
              <br />
              <span>A clearer way to study.</span>
            </h1>
            <p>
              Turn your lecture notes into focused study aids.
              <br className="desktop-break" /> Less time sorting. More time
              learning.
            </p>
          </div>
          <div className="hero-note">
            <span className="note-star">✳</span>
            <p>
              Made from your notes.
              <br />
              <strong>Made for your next exam.</strong>
            </p>
            <span className="note-line" />
          </div>
        </section>
        <ol className="study-steps" aria-label="Study steps">
          <li aria-current={!session ? "step" : undefined}><span>1</span> Upload notes</li>
          <li aria-current={session && !result ? "step" : undefined}><span>2</span> Choose an activity</li>
          <li aria-current={result ? "step" : undefined}><span>3</span> Start studying</li>
        </ol>
        {health && !health.aiConfigured && (
          <div className="notice">
            <AlertCircle size={18} />
            <p>
              <strong>Study activities are not ready yet.</strong> You can upload notes now. Ask the person managing this app to finish the AI setup.
            </p>
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={19} />
            <p>{error}</p>
            <button
              type="button"
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={17} />
            </button>
          </div>
        )}
        {restoring && (
          <p role="status" className="muted">
            Loading your study space…
          </p>
        )}
        <div className="study-layout">
          <aside>
            <FileUpload
              maxFileBytes={health?.maxFileBytes}
              key={uploadKey}
              onUpload={upload}
              busy={busy}
              session={session}
              onReset={reset}
              progress={uploadProgress}
            />
            <div className="small-note">
              <BookOpen size={17} />
              <p>
                Your notes are the source.
                <br />
                Every study aid is checked against it.
              </p>
            </div>
            <SessionHistory activeId={session?.id} fileCount={session?.files.length} busy={busy} onSelect={openSession} />
          </aside>
          <div className="workspace">
            <SourcePicker session={session} selectedIds={selectedIds} onChange={setSelectedIds} busy={busy} />
            <ActionButtons session={session} busy={busy || !selectedIds.length || selectionTooLong} generating={generating} activeTask={activeTask} generate={generate} />
            <LoadingState state={agentState} busy={generating} />
            <ResultPanel
              result={result}
              session={session}
              activeTask={activeTask}
              onSelectTask={selectTask}
              onSelectOutput={setSelectedOutputId}
              busy={busy}
              onScore={(score) =>
                setSession((current) => ({
                  ...current,
                  quizResults: [score, ...current.quizResults],
                }))
              }
            />
          </div>
        </div>
        <footer>
          <span>
            Smart Study Agent <span className="footer-dot">/</span> Exam
            preparation, a little simpler.
          </span>
          <span>Built for learning. Powered by Gemini.</span>
        </footer>
      </main>
    </div>
  );
}
