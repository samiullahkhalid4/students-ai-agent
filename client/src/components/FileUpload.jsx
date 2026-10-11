import { useRef, useState } from "react";
import { Upload, FileText, Plus, X } from "lucide-react";

export default function FileUpload({ onUpload, busy, session, onReset, progress, maxFileBytes = 4 * 1024 * 1024 }) {
  const [files, setFiles] = useState([]);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);
  const maxMegabytes = maxFileBytes / 1024 / 1024;
  function chooseFiles(selected) {
    setError("");
    const next = Array.from(selected || []);
    if (!next.length) return;
    if (next.some((file) => !/\.(pdf|txt|docx)$/i.test(file.name))) {
      setFiles([]);
      setError("Choose a PDF, TXT, or DOCX file.");
      return;
    }
    if (next.some((file) => file.size > maxFileBytes)) {
      setFiles([]);
      setError(`Each file must be ${maxMegabytes} MB or smaller.`);
      return;
    }
    if (next.length + (session?.files.length || 0) > 50) {
      setFiles([]);
      setError("You can keep up to 50 files in one subject. Choose fewer files.");
      return;
    }
    setFiles(next);
  }
  async function submit(event) {
    event.preventDefault();
    if (!files.length || busy) return;
    setError("");
    const failed = await onUpload({ files, name: name.trim(), subject: subject.trim() });
    setFiles(failed);
    if (fileInput.current) fileInput.current.value = "";
  }
  const uploadForm = (
    <form onSubmit={submit}>
        <fieldset disabled={busy}>
          {!session && <>
            <label htmlFor="student-name">Student name</label>
            <input id="student-name" autoComplete="given-name" placeholder="e.g. Ayesha Khan" value={name}
              onChange={(e) => setName(e.target.value)} required maxLength={100} pattern=".*\S.*" />
            <label htmlFor="subject">Subject</label>
            <input id="subject" placeholder="e.g. Artificial Intelligence" value={subject}
              onChange={(e) => setSubject(e.target.value)} required maxLength={160} pattern=".*\S.*" />
          </>}
          <label className={session ? "visually-hidden" : undefined} htmlFor="lecture-file">{session ? "Add more notes" : "Upload notes"}</label>
          <div className={`dropzone ${dragging ? "dragging" : ""} ${files.length ? "has-file" : ""}`}
            onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) chooseFiles(e.dataTransfer.files); }}>
            <input ref={fileInput} id="lecture-file" type="file" multiple accept=".pdf,.txt,.docx"
              aria-describedby="upload-help" onChange={(e) => chooseFiles(e.target.files)} />
            <div className="upload-icon"><Upload size={23} /></div>
            <strong>{files.length ? `${files.length} files selected` : "Choose files or drop them here"}</strong>
            <span>You can select more than one file</span>
            <small id="upload-help">PDF, TXT, DOCX · {maxMegabytes} MB per file · 50 files per subject</small>
          </div>
          {!!files.length && <ul className="upload-queue">{files.map((file, index) => <li key={`${file.name}-${index}`}>
            <span>{file.name}</span><button type="button" className="icon-button" aria-label={`Remove ${file.name}`}
              onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}><X size={16} /></button>
          </li>)}</ul>}
          {error && <p className="field-error" role="alert">{error}</p>}
          <button className="button primary full upload-button"
            disabled={!files.length || (!session && (!name.trim() || !subject.trim())) || busy}>
            {progress || (session ? "Add selected notes" : "Upload my notes")} <Plus size={17} />
          </button>
        </fieldset>
      </form>
  );
  return (
    <section className="panel lecture-card" aria-labelledby="lecture-heading">
      <div className="section-label"><span className="step-number">1</span> UPLOAD NOTES</div>
      <h2 id="lecture-heading">{session ? session.subject : "Create your subject"}</h2>
      <p className="muted intro-copy">{session
        ? `${session.files.length} ${session.files.length === 1 ? "file" : "files"} saved · Add new lectures here anytime.`
        : "One subject, all your lecture notes. Choose several files together."}</p>
      {session && <>
        <p className="subject-owner">Student: <strong>{session.student_name}</strong></p>
        <ul className="saved-files">{session.files.map((file) => <li key={file.id}>
          <FileText size={18} /><span>{file.filename}</span><span className="saved-label">Saved</span>
        </li>)}</ul>
        <p className="ready-note" role="status">Your notes are ready. Choose what to do next.</p>
        <a href="#task-heading" className="button primary full study-next">Choose an activity</a>
      </>}
      {session ? <details className="add-notes" open={files.length > 0 || Boolean(progress) || Boolean(error) ? true : undefined}>
        <summary>Add more notes</summary>{uploadForm}
      </details> : uploadForm}
      {progress && <p role="status" className="upload-progress">{progress}</p>}
      {session && <button type="button" className="button secondary full new-subject" onClick={onReset} disabled={busy}>
        Create another subject
      </button>}
      <p className="privacy-note">Your notes are saved with this app. Selected notes are sent to Gemini when you create a study aid.</p>
    </section>
  );
}
