import Foundation
import GRDB

/// Tracks local changes made while offline, for replay during sync.
struct ChangeLogEntry: Codable, FetchableRecord, MutablePersistableRecord {
    static let databaseTableName = "change_log"

    var id: Int64?
    var entity: String
    var entity_id: String
    var operation: String
    var payload: String?
    var field_changes: String?
    var changed_at: String?
    var synced: Int

    mutating func didInsert(_ inserted: InsertionSuccess) {
        id = inserted.rowID
    }

    /// Log an insert or update operation
    static func log<T: Encodable>(_ db: Database, entity: String, entityId: String, operation: String, record: T) throws {
        let encoder = JSONEncoder()
        let data = try encoder.encode(record)
        let payload = String(data: data, encoding: .utf8)

        var entry = ChangeLogEntry(
            entity: entity,
            entity_id: entityId,
            operation: operation,
            payload: payload,
            synced: 0
        )
        try entry.insert(db)
    }

    /// Log a delete operation
    static func logDelete(_ db: Database, entity: String, entityId: String) throws {
        var entry = ChangeLogEntry(
            entity: entity,
            entity_id: entityId,
            operation: "delete",
            payload: nil,
            synced: 0
        )
        try entry.insert(db)
    }
}
