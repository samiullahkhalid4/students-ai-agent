export function selectionSize(files, selectedIds) {
  const selected = files.filter((file) => selectedIds.includes(file.id));
  return selected.reduce((sum, file, index) => sum + file.character_count +
    (selected.length > 1 ? `Source ${index + 1}: ${file.filename}\n`.length + (index ? 2 : 0) : 0), 0);
}
export default function SourcePicker({ session, selectedIds, onChange, busy }) {
  if (!session) return null;
  const all = selectedIds.length === session.files.length;
  const characters = selectionSize(session.files, selectedIds);
  return <fieldset className="panel source-picker" disabled={busy}>
    <legend>Which notes do you want to study?</legend>
    <label className="source-choice"><input type="checkbox" checked={all}
      onChange={(e) => onChange(e.target.checked ? session.files.map((file) => file.id) : [])} />
      <strong>Study all notes</strong><span>{session.files.length} {session.files.length === 1 ? "file" : "files"}</span></label>
    <details>
      <summary>Select specific files · {selectedIds.length} selected</summary>
      <div className="source-options">{session.files.map((file) => <label className="source-choice" key={file.id}>
        <input type="checkbox" checked={selectedIds.includes(file.id)} onChange={(e) => onChange(e.target.checked
          ? [...selectedIds, file.id] : selectedIds.filter((id) => id !== file.id))} /><span>{file.filename}</span>
      </label>)}</div>
    </details>
    <p className={characters > 60000 || !selectedIds.length ? "field-error" : "muted small"} role="status">
      {!selectedIds.length ? "Select at least one file to start an activity."
        : characters > 60000 ? "These notes are too long to study together. Select fewer files (up to 60,000 characters)."
        : `${selectedIds.length} ${selectedIds.length === 1 ? "file" : "files"} will be used for your next activity.`}
    </p>
  </fieldset>;
}
