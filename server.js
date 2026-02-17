const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const db = new Database(path.join(__dirname, 'database.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cues (
      id TEXT PRIMARY KEY,
      reel TEXT DEFAULT '',
      scene TEXT DEFAULT '',
      cue_name TEXT DEFAULT '',
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      dialog TEXT NOT NULL,
      character_id TEXT NOT NULL,
      notes TEXT DEFAULT '',
      status TEXT DEFAULT 'Spotted',
      priority TEXT DEFAULT 'Medium',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (character_id) REFERENCES characters(id)
    );

    CREATE INDEX IF NOT EXISTS idx_cues_character ON cues(character_id);
    CREATE INDEX IF NOT EXISTS idx_cues_start_time ON cues(start_time);
  `);
}

createTables();

// Add new columns if missing (safe to run multiple times)
const newCueColumns = [];

for (const col of newCueColumns) {
  try {
    db.exec(`ALTER TABLE cues ADD COLUMN ${col.name} ${col.def}`);
  } catch (e) {
    // Column already exists — ignore
  }
}

// --- SSE ---
const sseClients = new Set();
// In-memory map of who's editing which cue: { cueId: { userName, clientId, startedAt } }
const editingCues = new Map();

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

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');

  const clientId = crypto.randomUUID();
  const client = { id: clientId, res };
  sseClients.add(client);

  // Send client its ID and current editing state
  const editingState = {};
  for (const [cueId, entry] of editingCues) {
    editingState[cueId] = { userName: entry.userName, clientId: entry.clientId };
  }
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId, editingState })}\n\n`);

  req.on('close', () => {
    sseClients.delete(client);
    // Clean up any editing entries for this client
    for (const [cueId, entry] of editingCues) {
      if (entry.clientId === clientId) {
        editingCues.delete(cueId);
        broadcast({ type: 'editing-stop', cueId }, clientId);
      }
    }
  });
});

function broadcast(event, originClientId) {
  const data = JSON.stringify({ ...event, originClientId });
  for (const client of sseClients) {
    client.res.write(`event: update\ndata: ${data}\n\n`);
  }
}

// --- Health Check ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// --- Editing Status API ---

app.post('/api/cues/:id/editing', (req, res) => {
  const cueId = req.params.id;
  const { userName, clientId } = req.body;
  editingCues.set(cueId, { userName, clientId, startedAt: Date.now() });
  broadcast({ type: 'editing-start', cueId, userName }, clientId);
  res.json({ success: true });
});

app.delete('/api/cues/:id/editing', (req, res) => {
  const cueId = req.params.id;
  const { clientId } = req.body || {};
  editingCues.delete(cueId);
  broadcast({ type: 'editing-stop', cueId }, clientId);
  res.json({ success: true });
});

// --- Characters API ---

app.get('/api/characters', (req, res) => {
  const characters = db.prepare('SELECT * FROM characters ORDER BY name').all();
  res.json(characters);
});

app.post('/api/characters', (req, res) => {
  const { name, clientId, id: providedId } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const id = providedId || crypto.randomUUID();
  try {
    db.prepare('INSERT INTO characters (id, name) VALUES (?, ?)').run(id, name.trim());
    const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
    broadcast({ type: 'created', entity: 'character', id: character.id }, clientId);
    res.status(201).json(character);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Character name already exists' });
    }
    throw err;
  }
});

app.delete('/api/characters/:id', (req, res) => {
  const { clientId } = req.body || {};
  const id = req.params.id;
  // Delete associated cues first, then the character
  db.prepare('DELETE FROM cues WHERE character_id = ?').run(id);
  const result = db.prepare('DELETE FROM characters WHERE id = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Character not found' });
  }
  broadcast({ type: 'deleted', entity: 'character', id }, clientId);
  res.json({ success: true });
});

// --- Cues API ---

const CUE_SELECT = `
  SELECT cues.*, characters.name AS character_name
  FROM cues
  JOIN characters ON cues.character_id = characters.id
`;

app.get('/api/cues', (req, res) => {
  let query = CUE_SELECT;
  const params = [];

  if (req.query.since) {
    query += ' WHERE cues.updated_at > ?';
    params.push(req.query.since);
  }

  query += ' ORDER BY cues.start_time';
  const cues = db.prepare(query).all(...params);
  res.json(cues);
});

app.get('/api/cues/:id', (req, res) => {
  const cue = db.prepare(`${CUE_SELECT} WHERE cues.id = ?`).get(req.params.id);
  if (!cue) {
    return res.status(404).json({ error: 'Cue not found' });
  }
  res.json(cue);
});

app.post('/api/cues', (req, res) => {
  const { start_time, end_time, dialog, character_id, clientId, id: providedId,
          reel, scene, cue_name, notes, status, priority } = req.body;
  if (!start_time || !end_time || !dialog || !character_id) {
    return res.status(400).json({ error: 'start_time, end_time, dialog, and character_id are required' });
  }
  const id = providedId || crypto.randomUUID();
  db.prepare(`
    INSERT INTO cues (id, reel, scene, cue_name, start_time, end_time, dialog, character_id, notes, status, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, reel || '', scene || '', cue_name || '', start_time, end_time, dialog, character_id,
         notes || '', status || 'Spotted', priority || 'Medium');
  const cue = db.prepare(`${CUE_SELECT} WHERE cues.id = ?`).get(id);
  broadcast({ type: 'created', entity: 'cue', id: cue.id }, clientId);
  res.status(201).json(cue);
});

app.put('/api/cues/:id', (req, res) => {
  const { start_time, end_time, dialog, character_id, updated_at, baseCue, clientId,
          reel, scene, cue_name, notes, status, priority } = req.body;
  const id = req.params.id;
  const mergeFields = ['start_time', 'end_time', 'dialog', 'character_id',
                       'reel', 'scene', 'cue_name', 'notes', 'status', 'priority'];

  const getCueWithName = (cueId) => db.prepare(`${CUE_SELECT} WHERE cues.id = ?`).get(cueId);

  const existing = db.prepare('SELECT * FROM cues WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Cue not found' });
  }

  const mine = {
    start_time, end_time, dialog, character_id,
    reel: reel ?? existing.reel, scene: scene ?? existing.scene,
    cue_name: cue_name ?? existing.cue_name, notes: notes ?? existing.notes,
    status: status ?? existing.status, priority: priority ?? existing.priority,
  };

  const saveCue = (values) => {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE cues SET reel = ?, scene = ?, cue_name = ?, start_time = ?, end_time = ?,
        dialog = ?, character_id = ?, notes = ?, status = ?, priority = ?, updated_at = ?
      WHERE id = ?
    `).run(values.reel, values.scene, values.cue_name, values.start_time, values.end_time,
           values.dialog, values.character_id, values.notes, values.status, values.priority, now, id);
  };

  // No conflict — timestamps match, just save
  if (!updated_at || existing.updated_at === updated_at) {
    saveCue(mine);
    const cue = getCueWithName(id);
    broadcast({ type: 'updated', entity: 'cue', id }, clientId);
    return res.json(cue);
  }

  // Conflict detected — attempt 3-way merge if baseCue is provided
  if (baseCue) {
    const theirs = existing;
    const merged = {};
    const conflictingFields = [];
    const mergedFields = [];

    for (const field of mergeFields) {
      const baseVal = String(baseCue[field] ?? '');
      const mineVal = String(mine[field] ?? '');
      const theirsVal = String(theirs[field] ?? '');

      if (mineVal === baseVal) {
        merged[field] = theirs[field];
      } else if (theirsVal === baseVal) {
        merged[field] = mine[field];
        mergedFields.push(field);
      } else if (mineVal === theirsVal) {
        merged[field] = mine[field];
      } else {
        conflictingFields.push(field);
      }
    }

    if (conflictingFields.length === 0) {
      saveCue(merged);
      const cue = getCueWithName(id);
      broadcast({ type: 'updated', entity: 'cue', id }, clientId);
      return res.json({ ...cue, merged: true, mergedFields });
    }

    const serverCue = getCueWithName(id);
    return res.status(409).json({ error: 'conflict', serverCue, conflictingFields });
  }

  // No baseCue provided — fall back to full conflict
  const serverCue = getCueWithName(id);
  return res.status(409).json({ error: 'conflict', serverCue });
});

app.delete('/api/cues/:id', (req, res) => {
  const { clientId } = req.body || {};
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
  console.log(`Sound Cue Manager running at http://localhost:${PORT}`);
});
