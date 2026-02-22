import express, { Request, Response } from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import type { Cue, EditorEntry, SSEEvent } from '../shared/types';

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../web/dist')));

// Database setup — stored in ~/Documents/CueHub/server/ as a user document, overridable via DB_PATH
const defaultDbDir = path.join(os.homedir(), 'Documents', 'CueHub', 'server');
const dbPath = process.env.DB_PATH ?? path.join(defaultDbDir, 'database.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cues (
      id TEXT PRIMARY KEY,
      cue_name TEXT DEFAULT '',
      dialog TEXT DEFAULT '',
      status TEXT DEFAULT 'spotted',
      priority TEXT DEFAULT 'medium',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

createTables();

// --- SSE ---
interface SseClient {
  id: string;
  res: Response;
}

const sseClients = new Set<SseClient>();
const editingCues = new Map<string, EditorEntry & { startedAt: number }>();

// Clean stale editing entries older than 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [cueId, entry] of editingCues) {
    if (now - entry.startedAt > 5 * 60 * 1000) {
      editingCues.delete(cueId);
      broadcast({ type: 'editing-stop', cueId }, entry.clientId);
    }
  }
}, 60 * 1000);

app.get('/api/events', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');

  const clientId = crypto.randomUUID();
  const client: SseClient = { id: clientId, res };
  sseClients.add(client);

  // Send client its ID and current editing state
  const editingState: Record<string, { userName: string; clientId: string }> = {};
  for (const [cueId, entry] of editingCues) {
    editingState[cueId] = { userName: entry.userName, clientId: entry.clientId };
  }
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId, editingState })}\n\n`);

  req.on('close', () => {
    sseClients.delete(client);
    for (const [cueId, entry] of editingCues) {
      if (entry.clientId === clientId) {
        editingCues.delete(cueId);
        broadcast({ type: 'editing-stop', cueId }, clientId);
      }
    }
  });
});

function broadcast(event: Partial<SSEEvent> & { cueId?: string }, originClientId: string | undefined): void {
  const data = JSON.stringify({ ...event, originClientId });
  for (const client of sseClients) {
    client.res.write(`event: update\ndata: ${data}\n\n`);
  }
}

// --- Health Check ---
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// --- Editing Status API ---

app.post('/api/cues/:id/editing', (req: Request, res: Response) => {
  const cueId = req.params.id;
  const { userName, clientId } = req.body as { userName: string; clientId: string };
  editingCues.set(cueId, { userName, clientId, startedAt: Date.now() });
  broadcast({ type: 'editing-start', cueId, userName }, clientId);
  res.json({ success: true });
});

app.delete('/api/cues/:id/editing', (req: Request, res: Response) => {
  const cueId = req.params.id;
  const { clientId } = (req.body ?? {}) as { clientId?: string };
  editingCues.delete(cueId);
  broadcast({ type: 'editing-stop', cueId }, clientId);
  res.json({ success: true });
});

// --- Cues API ---

const CUE_SELECT = `SELECT * FROM cues`;

app.get('/api/cues', (req: Request, res: Response) => {
  let query = CUE_SELECT;
  const params: string[] = [];

  if (req.query.since) {
    query += ' WHERE updated_at > ?';
    params.push(req.query.since as string);
  }

  query += ' ORDER BY cue_name';
  const cues = db.prepare(query).all(...params) as Cue[];
  res.json(cues);
});

app.get('/api/cues/:id', (req: Request, res: Response) => {
  const cue = db.prepare(`${CUE_SELECT} WHERE id = ?`).get(req.params.id) as Cue | undefined;
  if (!cue) {
    return res.status(404).json({ error: 'Cue not found' });
  }
  res.json(cue);
});

app.post('/api/cues', (req: Request, res: Response) => {
  const { cue_name, dialog, status, priority, clientId, id: providedId } =
    req.body as Partial<Cue> & { clientId?: string; id?: string };

  const id = providedId ?? crypto.randomUUID();
  db.prepare(`
    INSERT INTO cues (id, cue_name, dialog, status, priority)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, cue_name ?? '', dialog ?? '', status ?? 'spotted', priority ?? 'medium');
  const cue = db.prepare(`${CUE_SELECT} WHERE id = ?`).get(id) as Cue;
  broadcast({ type: 'created', entity: 'cue', id: cue.id }, clientId);
  res.status(201).json(cue);
});

app.put('/api/cues/:id', (req: Request, res: Response) => {
  const { cue_name, dialog, status, priority, updated_at, baseCue, clientId } =
    req.body as Partial<Cue> & { updated_at?: string; baseCue?: Cue; clientId?: string };

  const id = req.params.id;
  const mergeFields: (keyof Cue)[] = ['cue_name', 'dialog', 'status', 'priority'];

  const getCue = (cueId: string): Cue =>
    db.prepare(`${CUE_SELECT} WHERE id = ?`).get(cueId) as Cue;

  const existing = db.prepare('SELECT * FROM cues WHERE id = ?').get(id) as Cue | undefined;
  if (!existing) {
    return res.status(404).json({ error: 'Cue not found' });
  }

  const mine: Partial<Cue> = {
    cue_name: cue_name ?? existing.cue_name,
    dialog: dialog ?? existing.dialog,
    status: status ?? existing.status,
    priority: priority ?? existing.priority,
  };

  const saveCue = (values: Partial<Cue>): void => {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE cues SET cue_name = ?, dialog = ?, status = ?, priority = ?, updated_at = ?
      WHERE id = ?
    `).run(values.cue_name, values.dialog, values.status, values.priority, now, id);
  };

  // No conflict — timestamps match, just save
  if (!updated_at || existing.updated_at === updated_at) {
    saveCue(mine);
    const cue = getCue(id);
    broadcast({ type: 'updated', entity: 'cue', id }, clientId);
    return res.json(cue);
  }

  // Conflict detected — attempt 3-way merge if baseCue is provided
  if (baseCue) {
    const theirs = existing;
    const merged: Partial<Cue> = {};
    const conflictingFields: string[] = [];
    const mergedFields: string[] = [];

    for (const field of mergeFields) {
      const baseVal = String(baseCue[field] ?? '');
      const mineVal = String(mine[field] ?? '');
      const theirsVal = String(theirs[field] ?? '');

      if (mineVal === baseVal) {
        merged[field] = theirs[field] as never;
      } else if (theirsVal === baseVal) {
        merged[field] = mine[field] as never;
        mergedFields.push(field);
      } else if (mineVal === theirsVal) {
        merged[field] = mine[field] as never;
      } else {
        conflictingFields.push(field);
      }
    }

    if (conflictingFields.length === 0) {
      saveCue(merged);
      const cue = getCue(id);
      broadcast({ type: 'updated', entity: 'cue', id }, clientId);
      return res.json({ ...cue, merged: true, mergedFields });
    }

    const serverCue = getCue(id);
    return res.status(409).json({ error: 'conflict', serverCue, conflictingFields });
  }

  // No baseCue provided — fall back to full conflict
  const serverCue = getCue(id);
  return res.status(409).json({ error: 'conflict', serverCue });
});

app.delete('/api/cues/:id', (req: Request, res: Response) => {
  const { clientId } = (req.body ?? {}) as { clientId?: string };
  const id = req.params.id;
  const result = db.prepare('DELETE FROM cues WHERE id = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Cue not found' });
  }
  broadcast({ type: 'deleted', entity: 'cue', id }, clientId);
  res.json({ success: true });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Cue Hub running at http://localhost:${PORT}`);
});
