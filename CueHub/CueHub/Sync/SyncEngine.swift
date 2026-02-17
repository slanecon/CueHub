import Foundation

/// Synchronizes local offline changes with the remote server.js on reconnect.
///
/// Protocol:
/// 1. Deduplicate change log (collapse multiple updates to same entity)
/// 2. Replay characters first (FK integrity), then cues
/// 3. For each entry: POST (insert), PUT with baseCue (update), DELETE (delete)
/// 4. Pull server changes since last sync
/// 5. Apply pulled records to local DB
/// 6. Update lastSyncTimestamp
class SyncEngine {

    private let db = AppDatabase.shared
    private let settings = AppSettings.shared

    /// Progress callback: (current step, total steps, description)
    var onProgress: ((Int, Int, String) -> Void)?

    /// Called when a conflict needs user resolution. Returns true to keep local, false to discard.
    /// Parameters: (localPayload, serverCue) -> keepLocal
    var onConflict: (([String: Any], [String: Any]) -> Bool)?

    /// Called when sync completes
    var onComplete: ((SyncResult) -> Void)?

    struct SyncResult {
        var pushed: Int = 0
        var pulled: Int = 0
        var conflicts: Int = 0
        var errors: [String] = []
        var success: Bool { errors.isEmpty }
    }

    /// Run the full sync protocol against the remote server
    func sync(serverURL: String) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            let result = self.performSync(serverURL: serverURL)
            DispatchQueue.main.async {
                self.onComplete?(result)
            }
        }
    }

    private func performSync(serverURL: String) -> SyncResult {
        var result = SyncResult()

        // Step 1: Get and deduplicate unsynced changes
        guard let changes = try? db.unsyncedChanges() else {
            result.errors.append("Failed to read change log")
            return result
        }

        let deduplicated = deduplicateChanges(changes)
        let totalSteps = deduplicated.count + 2 // +2 for pull characters and pull cues
        var currentStep = 0

        // Step 2: Replay characters first (FK integrity)
        let charChanges = deduplicated.filter { $0.entity == "character" }
        let cueChanges = deduplicated.filter { $0.entity == "cue" }

        for entry in charChanges {
            currentStep += 1
            reportProgress(currentStep, totalSteps, "Syncing character \(currentStep)/\(charChanges.count + cueChanges.count)")
            let syncResult = replayEntry(entry, serverURL: serverURL)
            switch syncResult {
            case .success:
                result.pushed += 1
                markEntrySynced(entry)
            case .conflict:
                result.conflicts += 1
                markEntrySynced(entry)
            case .error(let msg):
                result.errors.append(msg)
            }
        }

        // Step 3: Replay cues
        for entry in cueChanges {
            currentStep += 1
            reportProgress(currentStep, totalSteps, "Syncing cue \(currentStep)/\(charChanges.count + cueChanges.count)")
            let syncResult = replayEntry(entry, serverURL: serverURL)
            switch syncResult {
            case .success:
                result.pushed += 1
                markEntrySynced(entry)
            case .conflict:
                result.conflicts += 1
                markEntrySynced(entry)
            case .error(let msg):
                result.errors.append(msg)
            }
        }

        // Step 4: Pull server changes since last sync
        currentStep += 1
        reportProgress(currentStep, totalSteps, "Pulling server characters...")
        let pulledChars = pullCharacters(serverURL: serverURL)
        result.pulled += pulledChars

        currentStep += 1
        reportProgress(currentStep, totalSteps, "Pulling server cues...")
        let pulledCues = pullCues(serverURL: serverURL)
        result.pulled += pulledCues

        // Step 5: Update timestamp and clean up
        settings.lastSyncTimestamp = ISO8601DateFormatter().string(from: Date())
        try? db.clearSyncedChanges()

        return result
    }

    // MARK: - Deduplication

    /// Collapse multiple changes to the same entity into a single final-state entry.
    /// If an entity was inserted then updated, keep only the insert with the final payload.
    /// If an entity was inserted then deleted, remove both.
    /// If an entity was updated then deleted, keep only the delete.
    private func deduplicateChanges(_ changes: [ChangeLogEntry]) -> [ChangeLogEntry] {
        // Group by (entity, entity_id), keep the entries in order
        var groups: [String: [ChangeLogEntry]] = [:]
        var order: [String] = []

        for entry in changes {
            let key = "\(entry.entity):\(entry.entity_id)"
            if groups[key] == nil {
                order.append(key)
                groups[key] = []
            }
            groups[key]!.append(entry)
        }

        var result: [ChangeLogEntry] = []
        for key in order {
            guard let entries = groups[key], !entries.isEmpty else { continue }

            let ops = entries.map { $0.operation }

            if ops.contains("delete") {
                if ops.first == "insert" {
                    // Created and deleted offline — net zero, skip entirely
                    // But still mark all as synced so they get cleaned up
                    let ids = entries.compactMap { $0.id }
                    try? db.markSynced(ids: ids)
                    continue
                }
                // Keep only the delete (last entry with delete operation)
                if let deleteEntry = entries.last(where: { $0.operation == "delete" }) {
                    result.append(deleteEntry)
                }
            } else if ops.contains("insert") {
                // Keep the insert but with the latest payload
                var entry = entries.first(where: { $0.operation == "insert" })!
                if let lastUpdate = entries.last(where: { $0.operation == "update" }) {
                    entry.payload = lastUpdate.payload
                }
                result.append(entry)
            } else {
                // Only updates — keep the last one
                if let lastUpdate = entries.last {
                    result.append(lastUpdate)
                }
            }
        }
        return result
    }

    // MARK: - Replay

    private enum ReplayResult {
        case success
        case conflict
        case error(String)
    }

    private func replayEntry(_ entry: ChangeLogEntry, serverURL: String) -> ReplayResult {
        switch entry.operation {
        case "insert":
            return replayInsert(entry, serverURL: serverURL)
        case "update":
            return replayUpdate(entry, serverURL: serverURL)
        case "delete":
            return replayDelete(entry, serverURL: serverURL)
        default:
            return .error("Unknown operation: \(entry.operation)")
        }
    }

    private func replayInsert(_ entry: ChangeLogEntry, serverURL: String) -> ReplayResult {
        guard let payload = entry.payload,
              let data = payload.data(using: .utf8),
              var body = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return .error("Invalid payload for insert \(entry.entity):\(entry.entity_id)")
        }

        // Ensure the UUID is included so the server uses it
        body["id"] = entry.entity_id

        let path = entry.entity == "character" ? "/api/characters" : "/api/cues"
        let (statusCode, _) = httpRequest(method: "POST", url: serverURL + path, body: body)

        switch statusCode {
        case 201:
            return .success
        case 409:
            // UUID or unique constraint collision — likely already exists
            return .success
        default:
            return .error("Insert \(entry.entity) \(entry.entity_id) failed: HTTP \(statusCode)")
        }
    }

    private func replayUpdate(_ entry: ChangeLogEntry, serverURL: String) -> ReplayResult {
        guard let payload = entry.payload,
              let data = payload.data(using: .utf8),
              var body = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return .error("Invalid payload for update \(entry.entity):\(entry.entity_id)")
        }

        let path = "/api/\(entry.entity == "character" ? "characters" : "cues")/\(entry.entity_id)"

        // Include baseCue for 3-way merge (the payload IS the base since it's the state we started from)
        // The updated_at in the payload is the base timestamp
        body["baseCue"] = body
        // Don't include updated_at so the server treats this as a direct save if timestamps match,
        // or triggers merge if they don't
        let (statusCode, responseData) = httpRequest(method: "PUT", url: serverURL + path, body: body)

        switch statusCode {
        case 200:
            // Success (possibly auto-merged)
            // Update local DB with server's response to keep in sync
            if let responseDict = responseData {
                applyServerResponse(entity: entry.entity, dict: responseDict)
            }
            return .success
        case 404:
            // Cue was deleted on the server — not an error for sync purposes
            // Remove from local DB too
            if entry.entity == "cue" {
                try? db.deleteCue(id: entry.entity_id, logChange: false)
            }
            return .success
        case 409:
            // Real conflict — both changed the same fields
            if let responseDict = responseData,
               let serverCue = responseDict["serverCue"] as? [String: Any] {
                // Ask the user what to do
                let keepLocal = onConflict?(body, serverCue) ?? true
                if keepLocal {
                    // Force-save with server's updated_at
                    body["updated_at"] = serverCue["updated_at"]
                    body.removeValue(forKey: "baseCue")
                    let (retryStatus, retryData) = httpRequest(method: "PUT", url: serverURL + path, body: body)
                    if retryStatus == 200, let retryDict = retryData {
                        applyServerResponse(entity: entry.entity, dict: retryDict)
                    }
                } else {
                    // Discard local — apply server version to local DB
                    applyServerResponse(entity: entry.entity, dict: serverCue)
                }
                return .conflict
            }
            return .error("Conflict on \(entry.entity) \(entry.entity_id) but no serverCue in response")
        default:
            return .error("Update \(entry.entity) \(entry.entity_id) failed: HTTP \(statusCode)")
        }
    }

    private func replayDelete(_ entry: ChangeLogEntry, serverURL: String) -> ReplayResult {
        let path = "/api/\(entry.entity == "character" ? "characters" : "cues")/\(entry.entity_id)"
        let (statusCode, _) = httpRequest(method: "DELETE", url: serverURL + path, body: [:])

        switch statusCode {
        case 200:
            return .success
        case 404:
            // Already deleted on server — that's fine
            return .success
        default:
            return .error("Delete \(entry.entity) \(entry.entity_id) failed: HTTP \(statusCode)")
        }
    }

    // MARK: - Pull

    private func pullCharacters(serverURL: String) -> Int {
        let (statusCode, data) = httpRequestArray(method: "GET", url: serverURL + "/api/characters")
        guard statusCode == 200, let chars = data else { return 0 }
        var count = 0
        for dict in chars {
            let char = LocalCharacter(from: dict)
            try? db.upsertCharacter(char)
            count += 1
        }
        return count
    }

    private func pullCues(serverURL: String) -> Int {
        var path = "/api/cues"
        if let since = settings.lastSyncTimestamp {
            let encoded = since.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? since
            path += "?since=\(encoded)"
        }
        let (statusCode, data) = httpRequestArray(method: "GET", url: serverURL + path)
        guard statusCode == 200, let cues = data else { return 0 }
        var count = 0
        for dict in cues {
            let cue = LocalCue(from: dict)
            try? db.upsertCue(cue)
            count += 1
        }
        return count
    }

    // MARK: - Helpers

    private func applyServerResponse(entity: String, dict: [String: Any]) {
        if entity == "character" {
            let char = LocalCharacter(from: dict)
            try? db.upsertCharacter(char)
        } else {
            let cue = LocalCue(from: dict)
            try? db.upsertCue(cue)
        }
    }

    private func markEntrySynced(_ entry: ChangeLogEntry) {
        if let id = entry.id {
            try? db.markSynced(ids: [id])
        }
    }

    private func reportProgress(_ step: Int, _ total: Int, _ description: String) {
        DispatchQueue.main.async { [weak self] in
            self?.onProgress?(step, total, description)
        }
    }

    // MARK: - HTTP

    private func httpRequest(method: String, url: String, body: [String: Any]) -> (Int, [String: Any]?) {
        guard let requestURL = URL(string: url) else { return (0, nil) }
        let semaphore = DispatchSemaphore(value: 0)
        var statusCode = 0
        var responseDict: [String: Any]?

        var request = URLRequest(url: requestURL)
        request.httpMethod = method
        request.timeoutInterval = 10
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !body.isEmpty && method != "GET" {
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }

        URLSession.shared.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }
            statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            if let data = data {
                responseDict = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            }
        }.resume()

        semaphore.wait()
        return (statusCode, responseDict)
    }

    private func httpRequestArray(method: String, url: String) -> (Int, [[String: Any]]?) {
        guard let requestURL = URL(string: url) else { return (0, nil) }
        let semaphore = DispatchSemaphore(value: 0)
        var statusCode = 0
        var responseArray: [[String: Any]]?

        var request = URLRequest(url: requestURL)
        request.httpMethod = method
        request.timeoutInterval = 10

        URLSession.shared.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }
            statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            if let data = data {
                responseArray = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
            }
        }.resume()

        semaphore.wait()
        return (statusCode, responseArray)
    }
}
