import { useRef, useState } from "react";
import { Upload, FileText, ArrowUpRight, Check, X } from "lucide-react";

export default function FileUpload({ onUpload, busy, session, onReset }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);
  function chooseFile(selected) {
    setError("");
    if (!selected) return;
    if (!/\.(pdf|txt|docx)$/i.test(selected.name)) {
      setFile(null);
      setError("Choose a PDF, TXT, or DOCX file.");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setFile(null);
      setError("Please choose a file smaller than 10 MB.");
      return;
    }
    setFile(selected);
  }
  async function submit(event) {
    event.preventDefault();
    if (!file) {
      setError("Choose your lecture file first.");
      return;
    }
    setError("");
    const data = new FormData();
    data.append("name", name.trim());
    data.append("subject", subject.trim());
    data.append("file", file);
    await onUpload(data);
  }
  return (
    <section className="panel lecture-card" aria-labelledby="lecture-heading">
      <div className="section-label">
        <span className="step-number">01</span> YOUR STARTING POINT
      </div>
      <h2 id="lecture-heading">Bring your lecture.</h2>
      <p className="muted intro-copy">
        A little material. A clearer way to study.
      </p>
      {session ? (
        <div className="loaded-lecture">
          <div className="file-preview">
            <FileText size={28} />
            <div>
              <strong>{session.filename}</strong>
              <span>
                {session.lecture_text.length.toLocaleString()} characters
                extracted
              </span>
            </div>
            <Check size={18} />
          </div>
          <dl>
            <div>
              <dt>Student</dt>
              <dd>{session.student_name}</dd>
            </div>
            <div>
              <dt>Subject</dt>
              <dd>{session.subject}</dd>
            </div>
          </dl>
          <div className="ready-note">
            <span className="status-dot" /> Lecture ready for your agent
          </div>
          <button
            type="button"
            className="button secondary full"
            onClick={onReset}
            disabled={busy}
          >
            Start a new session <ArrowUpRight size={16} />
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <label htmlFor="student-name">Student name</label>
            <input
              id="student-name"
              autoComplete="given-name"
              placeholder="e.g. Ayesha Khan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              pattern=".*\S.*"
            />
            <label htmlFor="subject">Subject</label>
            <input
              id="subject"
              placeholder="e.g. Artificial Intelligence"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              maxLength={160}
              pattern=".*\S.*"
            />
            <label htmlFor="lecture-file">Upload lecture</label>
            <div
              className={`dropzone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!busy) chooseFile(e.dataTransfer.files[0]);
              }}
            >
              <input
                ref={fileInput}
                id="lecture-file"
                type="file"
                accept=".pdf,.txt,.docx"
                onChange={(e) => chooseFile(e.target.files[0])}
              />
              <div className="upload-icon">
                {file ? <FileText size={23} /> : <Upload size={23} />}
              </div>
              <strong>{file ? file.name : "Drop your notes here"}</strong>
              <span>
                {file
                  ? `${(file.size / 1024).toFixed(1)} KB · Click to replace`
                  : "or click to browse files"}
              </span>
              <small>PDF, TXT, DOCX · Up to 10 MB</small>
            </div>
            {file && (
              <button
                type="button"
                className="text-button remove-file"
                onClick={() => {
                  setFile(null);
                  if (fileInput.current) fileInput.current.value = "";
                }}
              >
                <X size={13} /> Remove file
              </button>
            )}
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button primary full upload-button"
              disabled={!file || !name.trim() || !subject.trim() || busy}
            >
              {busy ? "Reading your lecture…" : "Prepare my lecture"}{" "}
              <ArrowUpRight size={17} />
            </button>
          </fieldset>
        </form>
      )}
      <p className="privacy-note">
        Files are read as text. Your lecture is saved locally and sent to Gemini
        when you generate a study aid.
      </p>
    </section>
  );
}
