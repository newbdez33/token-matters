import Database from 'better-sqlite3';

function msgData(opts: {
  role: string;
  modelID?: string;
  providerID?: string;
  tokens?: { total: number; input: number; output: number; reasoning: number; cache: { read: number; write: number } };
}): string {
  return JSON.stringify({
    role: opts.role,
    modelID: opts.modelID,
    providerID: opts.providerID,
    tokens: opts.tokens,
  });
}

export function createTestOpenCodeDb(dbPath: string): void {
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE project (
      id TEXT PRIMARY KEY
    );

    CREATE TABLE session (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      parent_id TEXT,
      slug TEXT NOT NULL,
      directory TEXT NOT NULL,
      title TEXT NOT NULL,
      version TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
    );

    CREATE TABLE message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      data TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE
    );
  `);

  // Project
  db.prepare(`INSERT INTO project (id) VALUES (?)`).run('proj-001');

  // Session 1: 2026-02-20T10:00:00Z = 1771495200000
  const ts1 = new Date('2026-02-20T10:00:00Z').getTime();
  db.prepare(`INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'sess-001', 'proj-001', 'fix-auth', '/tmp', 'Fix auth bug', '1', ts1, ts1,
  );

  // Session 2: 2026-02-21T14:00:00Z
  const ts2 = new Date('2026-02-21T14:00:00Z').getTime();
  db.prepare(`INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'sess-002', 'proj-001', 'add-tests', '/tmp', 'Add tests', '1', ts2, ts2,
  );

  // Session 3: 2026-02-20, no messages (edge case)
  const ts3 = new Date('2026-02-20T16:00:00Z').getTime();
  db.prepare(`INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'sess-003', 'proj-001', 'empty', '/tmp', 'Empty session', '1', ts3, ts3,
  );

  // Messages for session 1 — two assistant messages with different models
  const msgTs1 = new Date('2026-02-20T10:01:00Z').getTime();
  db.prepare(`INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)`).run(
    'msg-001', 'sess-001', msgTs1, msgTs1,
    msgData({
      role: 'assistant', modelID: 'claude-sonnet-4-6', providerID: 'anthropic',
      tokens: { total: 390, input: 200, output: 150, reasoning: 20, cache: { read: 30, write: 10 } },
    }),
  );

  const msgTs2 = new Date('2026-02-20T10:05:00Z').getTime();
  db.prepare(`INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)`).run(
    'msg-002', 'sess-001', msgTs2, msgTs2,
    msgData({
      role: 'assistant', modelID: 'gpt-4.1', providerID: 'openai',
      tokens: { total: 480, input: 300, output: 150, reasoning: 20, cache: { read: 20, write: 10 } },
    }),
  );

  // User message for session 1 (should be ignored — no tokens)
  const msgTs3 = new Date('2026-02-20T10:00:30Z').getTime();
  db.prepare(`INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)`).run(
    'msg-003', 'sess-001', msgTs3, msgTs3,
    msgData({ role: 'user' }),
  );

  // Messages for session 2
  const msgTs4 = new Date('2026-02-21T14:01:00Z').getTime();
  db.prepare(`INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)`).run(
    'msg-004', 'sess-002', msgTs4, msgTs4,
    msgData({
      role: 'assistant', modelID: 'claude-sonnet-4-6', providerID: 'anthropic',
      tokens: { total: 315, input: 200, output: 100, reasoning: 15, cache: { read: 10, write: 5 } },
    }),
  );

  db.close();
}
