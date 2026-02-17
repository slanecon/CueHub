import Foundation
import GRDB

/// Local SQLite model for cues
struct LocalCue: Codable, FetchableRecord, MutablePersistableRecord {
    static let databaseTableName = "cues"

    var id: String
    var reel: String
    var scene: String
    var cue_name: String
    var start_time: String
    var end_time: String
    var dialog: String
    var character_id: String
    var notes: String
    var status: String
    var priority: String
    var created_at: String?
    var updated_at: String?

    init(id: String = UUID().uuidString,
         reel: String = "", scene: String = "", cue_name: String = "",
         start_time: String, end_time: String, dialog: String, character_id: String,
         notes: String = "", status: String = "Spotted", priority: String = "Medium",
         created_at: String? = nil, updated_at: String? = nil) {
        self.id = id
        self.reel = reel
        self.scene = scene
        self.cue_name = cue_name
        self.start_time = start_time
        self.end_time = end_time
        self.dialog = dialog
        self.character_id = character_id
        self.notes = notes
        self.status = status
        self.priority = priority
        self.created_at = created_at
        self.updated_at = updated_at
    }

    /// Create from server JSON dictionary
    init(from dict: [String: Any]) {
        self.id = dict["id"] as? String ?? UUID().uuidString
        self.reel = dict["reel"] as? String ?? ""
        self.scene = dict["scene"] as? String ?? ""
        self.cue_name = dict["cue_name"] as? String ?? ""
        self.start_time = dict["start_time"] as? String ?? ""
        self.end_time = dict["end_time"] as? String ?? ""
        self.dialog = dict["dialog"] as? String ?? ""
        self.character_id = dict["character_id"] as? String ?? ""
        self.notes = dict["notes"] as? String ?? ""
        self.status = dict["status"] as? String ?? "Spotted"
        self.priority = dict["priority"] as? String ?? "Medium"
        self.created_at = dict["created_at"] as? String
        self.updated_at = dict["updated_at"] as? String
    }

    func toDict() -> [String: Any] {
        var d: [String: Any] = [
            "id": id, "reel": reel, "scene": scene, "cue_name": cue_name,
            "start_time": start_time, "end_time": end_time, "dialog": dialog,
            "character_id": character_id, "notes": notes, "status": status,
            "priority": priority,
        ]
        if let created_at = created_at { d["created_at"] = created_at }
        if let updated_at = updated_at { d["updated_at"] = updated_at }
        return d
    }
}

/// Cue joined with character name (read-only view for API responses)
struct CueWithCharacter: Codable, FetchableRecord {
    var id: String
    var reel: String
    var scene: String
    var cue_name: String
    var start_time: String
    var end_time: String
    var dialog: String
    var character_id: String
    var notes: String
    var status: String
    var priority: String
    var created_at: String?
    var updated_at: String?
    var character_name: String

    func toDict() -> [String: Any] {
        return [
            "id": id, "reel": reel, "scene": scene, "cue_name": cue_name,
            "start_time": start_time, "end_time": end_time, "dialog": dialog,
            "character_id": character_id, "notes": notes, "status": status,
            "priority": priority, "created_at": created_at ?? "",
            "updated_at": updated_at ?? "", "character_name": character_name,
        ]
    }
}
