import Foundation
import GRDB

/// Local SQLite model for characters
struct LocalCharacter: Codable, FetchableRecord, MutablePersistableRecord {
    static let databaseTableName = "characters"

    var id: String
    var name: String
    var created_at: String?

    init(id: String = UUID().uuidString, name: String, created_at: String? = nil) {
        self.id = id
        self.name = name
        self.created_at = created_at
    }

    /// Create from server JSON dictionary
    init(from dict: [String: Any]) {
        self.id = dict["id"] as? String ?? UUID().uuidString
        self.name = dict["name"] as? String ?? ""
        self.created_at = dict["created_at"] as? String
    }

    func toDict() -> [String: Any] {
        var d: [String: Any] = ["id": id, "name": name]
        if let created_at = created_at { d["created_at"] = created_at }
        return d
    }
}
