import Foundation
import GRDB

/// Manages the local SQLite database for offline operation.
class AppDatabase {
    static let shared = AppDatabase()

    let dbQueue: DatabaseQueue

    private init() {
        let fileManager = FileManager.default
        let documents = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!
        let dbDir = documents.appendingPathComponent("CueHub/desktop", isDirectory: true)
        try! fileManager.createDirectory(at: dbDir, withIntermediateDirectories: true)
        let dbPath = dbDir.appendingPathComponent("local.db").path

        var config = Configuration()
        config.prepareDatabase { db in
            db.trace { print("[SQL] \($0)") }
        }

        dbQueue = try! DatabaseQueue(path: dbPath, configuration: config)
        try! migrator.migrate(dbQueue)
    }

    private var migrator: DatabaseMigrator {
        var migrator = DatabaseMigrator()

        migrator.registerMigration("v1_initial") { db in
            try db.create(table: "characters", ifNotExists: true) { t in
                t.column("id", .text).primaryKey()
                t.column("name", .text).notNull().unique()
                t.column("created_at", .datetime).defaults(sql: "CURRENT_TIMESTAMP")
            }

            try db.create(table: "cues", ifNotExists: true) { t in
                t.column("id", .text).primaryKey()
                t.column("reel", .text).defaults(to: "")
                t.column("scene", .text).defaults(to: "")
                t.column("cue_name", .text).defaults(to: "")
                t.column("start_time", .text).notNull()
                t.column("end_time", .text).notNull()
                t.column("dialog", .text).notNull()
                t.column("character_id", .text).notNull()
                    .references("characters", onDelete: .cascade)
                t.column("notes", .text).defaults(to: "")
                t.column("status", .text).defaults(to: "spotted")
                t.column("priority", .text).defaults(to: "medium")
                t.column("created_at", .datetime).defaults(sql: "CURRENT_TIMESTAMP")
                t.column("updated_at", .datetime).defaults(sql: "CURRENT_TIMESTAMP")
            }

            try db.create(table: "change_log", ifNotExists: true) { t in
                t.autoIncrementedPrimaryKey("id")
                t.column("entity", .text).notNull()
                t.column("entity_id", .text).notNull()
                t.column("operation", .text).notNull()
                t.column("payload", .text)
                t.column("field_changes", .text)
                t.column("changed_at", .datetime).defaults(sql: "CURRENT_TIMESTAMP")
                t.column("synced", .integer).defaults(to: 0)
            }

            try db.create(index: "idx_change_log_synced", on: "change_log", columns: ["synced"], ifNotExists: true)
        }

        migrator.registerMigration("v2_remove_characters") { db in
            // Drop old tables and recreate cues without character/timecode fields
            try db.drop(table: "cues")
            try db.drop(table: "characters")

            try db.create(table: "cues") { t in
                t.column("id", .text).primaryKey()
                t.column("cue_name", .text).defaults(to: "")
                t.column("dialog", .text).defaults(to: "")
                t.column("status", .text).defaults(to: "spotted")
                t.column("priority", .text).defaults(to: "medium")
                t.column("created_at", .datetime).defaults(sql: "CURRENT_TIMESTAMP")
                t.column("updated_at", .datetime).defaults(sql: "CURRENT_TIMESTAMP")
            }

            // Clear any stale change log entries from the old schema
            try db.execute(sql: "DELETE FROM change_log")
        }

        return migrator
    }

    // MARK: - Cue Operations

    func allCues(since: String? = nil) throws -> [LocalCue] {
        try dbQueue.read { db in
            var sql = "SELECT * FROM cues"
            var arguments: [any DatabaseValueConvertible] = []
            if let since = since {
                sql += " WHERE updated_at > ?"
                arguments.append(since)
            }
            sql += " ORDER BY cue_name"
            return try LocalCue.fetchAll(db, sql: sql, arguments: StatementArguments(arguments))
        }
    }

    func getCue(id: String) throws -> LocalCue? {
        try dbQueue.read { db in
            try LocalCue.fetchOne(db, sql: "SELECT * FROM cues WHERE id = ?", arguments: [id])
        }
    }

    func insertCue(_ cue: LocalCue, logChange: Bool = true) throws {
        try dbQueue.write { db in
            var c = cue; try c.insert(db)
            if logChange {
                try ChangeLogEntry.log(db, entity: "cue", entityId: cue.id, operation: "insert", record: cue)
            }
        }
    }

    func updateCue(_ cue: LocalCue, logChange: Bool = true) throws {
        try dbQueue.write { db in
            var c = cue; try c.update(db)
            if logChange {
                try ChangeLogEntry.log(db, entity: "cue", entityId: cue.id, operation: "update", record: cue)
            }
        }
    }

    func deleteCue(id: String, logChange: Bool = true) throws {
        try dbQueue.write { db in
            try db.execute(sql: "DELETE FROM cues WHERE id = ?", arguments: [id])
            if logChange {
                try ChangeLogEntry.logDelete(db, entity: "cue", entityId: id)
            }
        }
    }

    // MARK: - Change Log

    func unsyncedChanges() throws -> [ChangeLogEntry] {
        try dbQueue.read { db in
            try ChangeLogEntry.filter(Column("synced") == 0).order(Column("changed_at")).fetchAll(db)
        }
    }

    func markSynced(ids: [Int64]) throws {
        guard !ids.isEmpty else { return }
        try dbQueue.write { db in
            try db.execute(
                sql: "UPDATE change_log SET synced = 1 WHERE id IN (\(ids.map { "\($0)" }.joined(separator: ",")))"
            )
        }
    }

    func clearSyncedChanges() throws {
        try dbQueue.write { db in
            try db.execute(sql: "DELETE FROM change_log WHERE synced = 1")
        }
    }

    // MARK: - Bulk Operations (for sync pull)

    func upsertCue(_ cue: LocalCue) throws {
        try dbQueue.write { db in
            var c = cue; try c.save(db)
        }
    }
}
