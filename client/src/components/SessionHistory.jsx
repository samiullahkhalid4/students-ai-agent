import { useEffect, useState } from "react";
import { api } from "../services/api.js";

export default function SessionHistory({ activeId, busy, onSelect }) {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.sessions().then(({ sessions }) => {
      if (active) { setSessions(sessions); setError(""); }
    }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [activeId]);
  return (
    <section className="panel session-history" aria-label="Previous study sessions">
      <h3>Previous study sessions</h3>
      <p className="muted small">Reopen a lecture and its saved study aids on this computer.</p>
      {error && <p role="alert" className="field-error">{error}</p>}
      <label htmlFor="previous-session">Saved lectures</label>
      <select id="previous-session" disabled={busy || !sessions.length} value={activeId || ""}
        onChange={(e) => { if (e.target.value) onSelect(Number(e.target.value)); }}>
        <option value="">Choose a session</option>
        {sessions.map((session) => <option key={session.id} value={session.id}>
          #{session.id} · {session.subject} · {session.student_name} · {session.filename}
        </option>)}
      </select>
    </section>
  );
}
