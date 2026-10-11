    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS study_sessions (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id),
      subject TEXT NOT NULL, filename TEXT NOT NULL, lecture_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE IF NOT EXISTS generated_outputs (
      id INTEGER PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES study_sessions(id),
      task_type TEXT NOT NULL CHECK(task_type IN ('summary','questions','mcqs','revision')),
      output TEXT NOT NULL, metadata TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE IF NOT EXISTS lecture_files (
      id INTEGER PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES study_sessions(id),
      filename TEXT NOT NULL,
      lecture_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE IF NOT EXISTS quiz_results (
      id INTEGER PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES study_sessions(id),
      output_id INTEGER NOT NULL REFERENCES generated_outputs(id),
      score INTEGER NOT NULL, total INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      CHECK(score >= 0 AND score <= total AND total > 0)
    );

