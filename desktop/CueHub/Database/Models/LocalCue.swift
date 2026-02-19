import Foundation
import GRDB

/// Local SQLite model for cues
struct LocalCue: Codable, FetchableRecord, MutablePersistableRecord {
    static let databaseTableName = "cues"

    var id: String
    var cue_name: String
    var dialog: String
    var status: String
    var priority: String
    var created_at: String?
    var updated_at: String?

    init(id: String = UUID().uuidString,
         cue_name: String = "", dialog: String = "",
         status: String = "spotted", priority: String = "medium",
         created_at: String? = nil, updated_at: String? = nil) {
        self.id = id
        self.cue_name = cue_name
        self.dialog = dialog
        self.status = status
        self.priority = priority
        self.created_at = created_at
        self.updated_at = updated_at
    }

    /// Create from server JSON dictionary
    init(from dict: [String: Any]) {
        self.id = dict["id"] as? String ?? UUID().uuidString
        self.cue_name = dict["cue_name"] as? String ?? ""
        self.dialog = dict["dialog"] as? String ?? ""
        self.status = dict["status"] as? String ?? "spotted"
        self.priority = dict["priority"] as? String ?? "medium"
        self.created_at = dict["created_at"] as? String
        self.updated_at = dict["updated_at"] as? String
    }

    func toDict() -> [String: Any] {
        var d: [String: Any] = [
            "id": id, "cue_name": cue_name, "dialog": dialog,
            "status": status, "priority": priority,
        ]
        if let created_at = created_at { d["created_at"] = created_at }
        if let updated_at = updated_at { d["updated_at"] = updated_at }
        return d
    }
}
