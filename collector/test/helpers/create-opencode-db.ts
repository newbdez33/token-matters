import Database from 'better-sqlite3';

export function createTestOpenCodeDb(dbPath: string): void {
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      title TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cache_write_tokens INTEGER DEFAULT 0,
      reasoning_tokens INTEGER DEFAULT 0,
      estimated_cost REAL DEFAULT 0
    );

    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      model_provider TEXT,
      model_id TEXT,
      created_at TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cache_write_tokens INTEGER DEFAULT 0,
      reasoning_tokens INTEGER DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
  `);

  // Session 1: 2026-02-20, has assistant messages with different models
  db.prepare(`INSERT INTO sessions (id, created_at, title, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'sess-001', '2026-02-20T10:00:00Z', 'Fix auth bug', 500, 300, 50, 20, 40,
  );

  // Session 2: 2026-02-21
  db.prepare(`INSERT INTO sessions (id, created_at, title, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'sess-002', '2026-02-21T14:00:00Z', 'Add tests', 200, 100, 10, 5, 15,
  );

  // Session 3: 2026-02-20, no messages (edge case)
  db.prepare(`INSERT INTO sessions (id, created_at, title) VALUES (?, ?, ?)`).run(
    'sess-003', '2026-02-20T16:00:00Z', 'Empty session',
  );

  // Messages for session 1 — two assistant messages with different models
  db.prepare(`INSERT INTO messages (id, session_id, role, model_provider, model_id, created_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'msg-001', 'sess-001', 'assistant', 'anthropic', 'claude-sonnet-4-6',
    '2026-02-20T10:01:00Z', 200, 150, 30, 10, 20,
  );
  db.prepare(`INSERT INTO messages (id, session_id, role, model_provider, model_id, created_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'msg-002', 'sess-001', 'assistant', 'openai', 'gpt-4.1',
    '2026-02-20T10:05:00Z', 300, 150, 20, 10, 20,
  );

  // User message for session 1 (should be ignored)
  db.prepare(`INSERT INTO messages (id, session_id, role, model_provider, model_id, created_at, input_tokens, output_tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'msg-003', 'sess-001', 'user', null, null, '2026-02-20T10:00:30Z', 0, 0,
  );

  // Messages for session 2
  db.prepare(`INSERT INTO messages (id, session_id, role, model_provider, model_id, created_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'msg-004', 'sess-002', 'assistant', 'anthropic', 'claude-sonnet-4-6',
    '2026-02-21T14:01:00Z', 200, 100, 10, 5, 15,
  );

  db.close();
}
