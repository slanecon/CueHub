# Cue Hub Web App - Test Design Document

## Overview
A web application for managing sound editing cues with dialog and character assignments. Designed for air-gapped LAN deployment with zero administration requirements.

## Technology Stack
- **Frontend**: Vanilla JavaScript (HTML5, CSS3)
- **Backend**: Node.js with Express
- **Database**: SQLite (file-based, no server process)
- **License**: All MIT/ISC licensed components

## Database Schema

```sql
CREATE TABLE characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_time TEXT NOT NULL,  -- Format: HH:MM:SS:FF or timecode
  end_time TEXT NOT NULL,
  dialog TEXT NOT NULL,
  character_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (character_id) REFERENCES characters(id)
);

CREATE INDEX idx_cues_character ON cues(character_id);
CREATE INDEX idx_cues_start_time ON cues(start_time);
```

## Application Structure

```
/
├── server.js           # Express server with SQLite
├── package.json        # Dependencies: express, better-sqlite3
├── database.db         # SQLite database file (auto-created)
└── public/
    ├── index.html      # Single-page app
    ├── style.css       # Styling
    └── app.js          # Frontend logic
```

## API Endpoints

### Characters
- `GET /api/characters` - List all characters
- `POST /api/characters` - Create character `{name}`
- `DELETE /api/characters/:id` - Delete character (cascade delete cues)

### Cues
- `GET /api/cues` - List all cues with character names (joined)
- `GET /api/cues/:id` - Get single cue
- `POST /api/cues` - Create cue `{start_time, end_time, dialog, character_id}`
- `PUT /api/cues/:id` - Update cue
- `DELETE /api/cues/:id` - Delete cue

## Multi-User Considerations
- SQLite handles concurrent reads natively
- Use WAL mode for better concurrent write performance
- Simple optimistic locking: include `updated_at` in PUT requests, return 409 if conflict
- No authentication (LAN trusted environment)

## Frontend Features
- Form for adding/editing cues
- Dropdown for character selection (populated from database)
- Quick "add new character" option in character dropdown
- Table view of all cues sorted by start time
- Inline editing capability
- Timecode validation (basic format checking)

## Deployment
```bash
npm install
node server.js
# Access at http://<server-ip>:3000
```

## Zero-Admin Features
- SQLite database auto-creates on first run
- No configuration files needed
- Single `node server.js` command to start
- Database is a single file (easy backup: copy `database.db`)
- No user management, no processes to monitor

## Timecode Format
Support flexible input: `HH:MM:SS:FF` where FF is frames (00-29 for 30fps)
Store as text for simplicity; validate format on input

## Optional Enhancements (Post-MVP)
- Export to CSV/JSON
- Import from CSV
- Filter/search cues by character or time range
- Batch operations
