import { useEffect, useState } from "react";
import { api } from "../services/api.js";

export default function SessionHistory({ activeId, fileCount, busy, onSelect }) {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.sessions().then(({ sessions }) => {
      if (active) { setSessions(sessions); setError(""); }
    }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [activeId, fileCount]);
  return (
    <section className="panel session-history" aria-label="My subjects">
      <h3>My subjects</h3>
      <p className="muted small">Continue with your notes, study aids, and quiz results.</p>
      {error && <p role="alert" className="field-error">{error}</p>}
      <label htmlFor="previous-session">Saved subjects</label>
      <select id="previous-session" disabled={busy || !sessions.length} value={activeId || ""}
        onChange={(e) => { if (e.target.value) onSelect(Number(e.target.value)); }}>
        <option value="">Choose a subject</option>
        {sessions.map((session) => <option key={session.id} value={session.id}>
          {session.subject} · {session.file_count} {session.file_count === 1 ? "file" : "files"} · {session.filename} · {session.student_name}
        </option>)}
      </select>
    </section>
  );
}
