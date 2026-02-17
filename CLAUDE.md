# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

### Node.js Server (web app)
- `npm start` or `node server.js` — runs on http://localhost:3000
- `npm install` — install dependencies (express, better-sqlite3)
- No test runner or linter configured

### macOS Desktop App (CueHub/)
- `cd CueHub && xcodegen generate` — regenerate Xcode project from project.yml
- `xcodebuild -project CueHub.xcodeproj -scheme CueHub build` — build from CLI
- `swift generate_icon.swift` — regenerate app icon PNGs from SF Symbols
- `./scripts/notarize.sh` — archive, sign, and notarize for distribution
- SPM dependencies: GRDB.swift (SQLite ORM), Swifter (embedded HTTP server)

## Architecture

This is a hybrid system: a Node.js web app and a native macOS desktop app that share the same web frontend and can sync with each other.

### Web App (server.js + public/)
Express.js server with SQLite (better-sqlite3, WAL mode). Vanilla JS frontend — no frameworks. Real-time updates via Server-Sent Events (SSE). The PUT endpoint implements 3-way field-level merge: clients send `baseCue` (state when form was loaded) alongside edits, and the server auto-merges non-conflicting field changes or returns 409 with conflict details.

### macOS Desktop App (CueHub/)
AppKit shell with WKWebView displaying the same web UI. An embedded Swifter HTTP server on port 3001 acts as a proxy layer:
- **Online**: proxies API requests to server.js on the LAN
- **Offline**: serves requests from a local GRDB SQLite database with a change_log table tracking all mutations

On reconnect, SyncEngine replays unsynced changes (characters first for FK integrity), uses the same 3-way merge protocol, then pulls new server data.

**WKWebView SSE workaround**: EventSource doesn't work in WKWebView with Swifter (data gets buffered). Instead, SSEBroadcaster calls `evaluateJavaScript` to push events directly via `window._nativeSSEHandler`. RemoteSSEListener subscribes to server.js's SSE stream using URLSessionDataDelegate streaming and forwards events through this native bridge.

### Key Data Flow
```
Browser ←→ server.js:3000 (SQLite)
Desktop WKWebView ←→ localhost:3001 (Swifter) ←→ server.js:3000 OR local GRDB
```

## Database Schema
- All primary keys are TEXT (UUIDs), generated with `crypto.randomUUID()` (Node) or `UUID().uuidString` (Swift)
- Cues have: reel, scene, cue_name, start_time, end_time, dialog, character_id (FK), notes, status, priority, timestamps
- Timecodes are stored as text in HH:MM:SS:FF format (validated at the application layer, 0-29 frames)

## Code Conventions
- **JavaScript**: Vanilla DOM manipulation, `async/await` for API calls, global `api(url, options)` helper that injects clientId and handles 409 conflicts
- **Swift**: Class-based with singletons (AppDatabase.shared, AppSettings.shared), `// MARK:` section comments, guard-based early returns
- **XcodeGen**: All Xcode project changes go through project.yml, then `xcodegen generate` — never edit .xcodeproj directly
- Web assets (index.html, app.js, style.css) are in public/ for the server and copied to CueHub/Resources/Web/ for the desktop app bundle