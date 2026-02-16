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

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    dialog TEXT NOT NULL,
    character_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (character_id) REFERENCES characters(id)
  );

  CREATE INDEX IF NOT EXISTS idx_cues_character ON cues(character_id);
  CREATE INDEX IF NOT EXISTS idx_cues_start_time ON cues(start_time);
`);

// --- SSE ---
const sseClients = new Set();

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

  // Send client its ID so it can ignore its own events
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

  req.on('close', () => {
    sseClients.delete(client);
  });
});

function broadcast(event, originClientId) {
  const data = JSON.stringify({ ...event, originClientId });
  for (const client of sseClients) {
    client.res.write(`event: update\ndata: ${data}\n\n`);
  }
}

// --- Characters API ---

app.get('/api/characters', (req, res) => {
  const characters = db.prepare('SELECT * FROM characters ORDER BY name').all();
  res.json(characters);
});

app.post('/api/characters', (req, res) => {
  const { name, clientId } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    const result = db.prepare('INSERT INTO characters (name) VALUES (?)').run(name.trim());
    const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(result.lastInsertRowid);
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
  const id = Number(req.params.id);
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

app.get('/api/cues', (req, res) => {
  const cues = db.prepare(`
    SELECT cues.*, characters.name AS character_name
    FROM cues
    JOIN characters ON cues.character_id = characters.id
    ORDER BY cues.start_time
  `).all();
  res.json(cues);
});

app.get('/api/cues/:id', (req, res) => {
  const cue = db.prepare(`
    SELECT cues.*, characters.name AS character_name
    FROM cues
    JOIN characters ON cues.character_id = characters.id
    WHERE cues.id = ?
  `).get(Number(req.params.id));
  if (!cue) {
    return res.status(404).json({ error: 'Cue not found' });
  }
  res.json(cue);
});

app.post('/api/cues', (req, res) => {
  const { start_time, end_time, dialog, character_id, clientId } = req.body;
  if (!start_time || !end_time || !dialog || !character_id) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  const result = db.prepare(
    'INSERT INTO cues (start_time, end_time, dialog, character_id) VALUES (?, ?, ?, ?)'
  ).run(start_time, end_time, dialog, Number(character_id));
  const cue = db.prepare(`
    SELECT cues.*, characters.name AS character_name
    FROM cues
    JOIN characters ON cues.character_id = characters.id
    WHERE cues.id = ?
  `).get(result.lastInsertRowid);
  broadcast({ type: 'created', entity: 'cue', id: cue.id }, clientId);
  res.status(201).json(cue);
});

app.put('/api/cues/:id', (req, res) => {
  const { start_time, end_time, dialog, character_id, updated_at, clientId } = req.body;
  const id = Number(req.params.id);

  // Optimistic locking
  const existing = db.prepare('SELECT updated_at FROM cues WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Cue not found' });
  }
  if (updated_at && existing.updated_at !== updated_at) {
    return res.status(409).json({ error: 'Cue was modified by another user. Please refresh and try again.' });
  }

  const now = new Date().toISOString();
  db.prepare(
    'UPDATE cues SET start_time = ?, end_time = ?, dialog = ?, character_id = ?, updated_at = ? WHERE id = ?'
  ).run(start_time, end_time, dialog, Number(character_id), now, id);

  const cue = db.prepare(`
    SELECT cues.*, characters.name AS character_name
    FROM cues
    JOIN characters ON cues.character_id = characters.id
    WHERE cues.id = ?
  `).get(id);
  broadcast({ type: 'updated', entity: 'cue', id }, clientId);
  res.json(cue);
});

app.delete('/api/cues/:id', (req, res) => {
  const { clientId } = req.body || {};
  const id = Number(req.params.id);
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
