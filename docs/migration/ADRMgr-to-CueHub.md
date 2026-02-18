# ADR Manager to Cue Hub migration spec

## Phase 1 - Feature parity (6-12 months?):

* Swift desktop app with SQLite
* Port all core ADR Manager functionality
* Single-user, local only
* This replaces current 4D app

## Phase 2 - Server mode (3-6 months):

* Node server + PostgreSQL
* Web app for browser access
* Multi-user collaboration
* Desktop app can either work locally OR connect to server (not both)

## Phase 3 - Satellite sync (6+ months):

* Offline-first architecture
* Sync engine
* Conflict resolution
* This is a major feature, treat it as such
