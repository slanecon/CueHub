import Foundation
import Swifter

/// Routes API requests to either the remote server.js (online) or local GRDB (offline).
class RequestRouter {

    enum Mode {
        case online(serverURL: String)
        case offline
    }

    private(set) var mode: Mode = .offline
    private let db = AppDatabase.shared

    // In-memory editing state (mirrors server.js editingCues map)
    private var editingCues: [String: [String: Any]] = [:]
    private let editingLock = NSLock()

    var isOnline: Bool {
        if case .online = mode { return true }
        return false
    }

    var editingState: [String: Any] {
        editingLock.lock()
        defer { editingLock.unlock() }
        var state: [String: Any] = [:]
        for (cueId, entry) in editingCues {
            state[cueId] = ["userName": entry["userName"] ?? "", "clientId": entry["clientId"] ?? ""]
        }
        return state
    }

    func goOnline(serverURL: String) {
        mode = .online(serverURL: serverURL)
        print("[Router] Switched to ONLINE mode: \(serverURL)")
    }

    func goOffline() {
        mode = .offline
        print("[Router] Switched to OFFLINE mode")
    }

    // MARK: - Proxy helpers

    private func proxyGET(path: String) -> HttpResponse {
        guard case .online(let serverURL) = mode,
              let url = URL(string: serverURL + path) else {
            return .internalServerError
        }
        let semaphore = DispatchSemaphore(value: 0)
        var result: HttpResponse = .internalServerError

        var request = URLRequest(url: url)
        request.timeoutInterval = 5
        URLSession.shared.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }
            guard let data = data, let httpResp = response as? HTTPURLResponse else {
                result = .internalServerError
                return
            }
            let contentType = httpResp.value(forHTTPHeaderField: "Content-Type") ?? "application/json"
            result = .raw(httpResp.statusCode, contentType, nil) { writer in
                try writer.write(data)
            }
        }.resume()
        semaphore.wait()
        return result
    }

    private func proxyRequest(method: String, path: String, body: [String: Any]) -> HttpResponse {
        guard case .online(let serverURL) = mode,
              let url = URL(string: serverURL + path) else {
            return .internalServerError
        }
        let semaphore = DispatchSemaphore(value: 0)
        var result: HttpResponse = .internalServerError

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 5
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !body.isEmpty {
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }

        URLSession.shared.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }
            guard let data = data, let httpResp = response as? HTTPURLResponse else {
                result = .internalServerError
                return
            }
            let contentType = httpResp.value(forHTTPHeaderField: "Content-Type") ?? "application/json"
            result = .raw(httpResp.statusCode, contentType, nil) { writer in
                try writer.write(data)
            }
        }.resume()
        semaphore.wait()
        return result
    }

    // MARK: - Characters

    func handleGetCharacters() -> HttpResponse {
        if case .online = mode {
            return proxyGET(path: "/api/characters")
        }
        // Offline: serve from local DB
        do {
            let chars = try db.allCharacters()
            let dicts = chars.map { $0.toDict() }
            return .ok(.json(dicts as Any))
        } catch {
            return .internalServerError
        }
    }

    func handlePostCharacter(body: [String: Any], broadcaster: SSEBroadcaster) -> HttpResponse {
        if case .online = mode {
            return proxyRequest(method: "POST", path: "/api/characters", body: body)
        }
        // Offline: insert locally
        let name = body["name"] as? String ?? ""
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else {
            return jsonError(400, "Name is required")
        }
        let id = body["id"] as? String ?? UUID().uuidString
        let char = LocalCharacter(id: id, name: name.trimmingCharacters(in: .whitespaces))
        do {
            try db.insertCharacter(char)
            let result = char.toDict()
            broadcaster.broadcast(event: [
                "type": "created", "entity": "character", "id": id,
                "originClientId": body["clientId"] as? String ?? ""
            ])
            return jsonResponse(201, result)
        } catch {
            if "\(error)".contains("UNIQUE") {
                return jsonError(409, "Character name already exists")
            }
            return .internalServerError
        }
    }

    func handleDeleteCharacter(id: String, body: [String: Any], broadcaster: SSEBroadcaster) -> HttpResponse {
        if case .online = mode {
            return proxyRequest(method: "DELETE", path: "/api/characters/\(id)", body: body)
        }
        do {
            try db.deleteCharacter(id: id)
            broadcaster.broadcast(event: [
                "type": "deleted", "entity": "character", "id": id,
                "originClientId": body["clientId"] as? String ?? ""
            ])
            return .ok(.json(["success": true] as [String: Any]))
        } catch {
            return .internalServerError
        }
    }

    // MARK: - Cues

    func handleGetCues(since: String?) -> HttpResponse {
        if case .online = mode {
            let path = since != nil ? "/api/cues?since=\(since!)" : "/api/cues"
            return proxyGET(path: path)
        }
        do {
            let cues = try db.allCues(since: since)
            let dicts = cues.map { $0.toDict() }
            return .ok(.json(dicts as Any))
        } catch {
            return .internalServerError
        }
    }

    func handleGetCue(id: String) -> HttpResponse {
        if case .online = mode {
            return proxyGET(path: "/api/cues/\(id)")
        }
        do {
            guard let cue = try db.getCue(id: id) else {
                return jsonError(404, "Cue not found")
            }
            return .ok(.json(cue.toDict() as Any))
        } catch {
            return .internalServerError
        }
    }

    func handlePostCue(body: [String: Any], broadcaster: SSEBroadcaster) -> HttpResponse {
        if case .online = mode {
            return proxyRequest(method: "POST", path: "/api/cues", body: body)
        }
        // Offline: insert locally
        guard let start = body["start_time"] as? String, !start.isEmpty,
              let end = body["end_time"] as? String, !end.isEmpty,
              let dialog = body["dialog"] as? String, !dialog.isEmpty,
              let charId = body["character_id"] as? String, !charId.isEmpty else {
            return jsonError(400, "start_time, end_time, dialog, and character_id are required")
        }

        let id = body["id"] as? String ?? UUID().uuidString
        let now = ISO8601DateFormatter().string(from: Date())
        let cue = LocalCue(
            id: id,
            reel: body["reel"] as? String ?? "",
            scene: body["scene"] as? String ?? "",
            cue_name: body["cue_name"] as? String ?? "",
            start_time: start, end_time: end, dialog: dialog, character_id: charId,
            notes: body["notes"] as? String ?? "",
            status: body["status"] as? String ?? "Spotted",
            priority: body["priority"] as? String ?? "Medium",
            created_at: now, updated_at: now
        )
        do {
            try db.insertCue(cue)
            guard let result = try db.getCue(id: id) else { return .internalServerError }
            broadcaster.broadcast(event: [
                "type": "created", "entity": "cue", "id": id,
                "originClientId": body["clientId"] as? String ?? ""
            ])
            return jsonResponse(201, result.toDict())
        } catch {
            return .internalServerError
        }
    }

    func handlePutCue(id: String, body: [String: Any], broadcaster: SSEBroadcaster) -> HttpResponse {
        if case .online = mode {
            return proxyRequest(method: "PUT", path: "/api/cues/\(id)", body: body)
        }
        // Offline: update locally (simplified — no 3-way merge needed in single-user offline mode)
        do {
            let now = ISO8601DateFormatter().string(from: Date())
            let cue = LocalCue(
                id: id,
                reel: body["reel"] as? String ?? "",
                scene: body["scene"] as? String ?? "",
                cue_name: body["cue_name"] as? String ?? "",
                start_time: body["start_time"] as? String ?? "",
                end_time: body["end_time"] as? String ?? "",
                dialog: body["dialog"] as? String ?? "",
                character_id: body["character_id"] as? String ?? "",
                notes: body["notes"] as? String ?? "",
                status: body["status"] as? String ?? "Spotted",
                priority: body["priority"] as? String ?? "Medium",
                updated_at: now
            )
            try db.updateCue(cue)
            guard let result = try db.getCue(id: id) else {
                return jsonError(404, "Cue not found")
            }
            broadcaster.broadcast(event: [
                "type": "updated", "entity": "cue", "id": id,
                "originClientId": body["clientId"] as? String ?? ""
            ])
            return .ok(.json(result.toDict() as Any))
        } catch {
            return .internalServerError
        }
    }

    func handleDeleteCue(id: String, body: [String: Any], broadcaster: SSEBroadcaster) -> HttpResponse {
        if case .online = mode {
            return proxyRequest(method: "DELETE", path: "/api/cues/\(id)", body: body)
        }
        do {
            try db.deleteCue(id: id)
            broadcaster.broadcast(event: [
                "type": "deleted", "entity": "cue", "id": id,
                "originClientId": body["clientId"] as? String ?? ""
            ])
            return .ok(.json(["success": true] as [String: Any]))
        } catch {
            return .internalServerError
        }
    }

    // MARK: - Editing Status

    func handleEditingStart(cueId: String, body: [String: Any], broadcaster: SSEBroadcaster) -> HttpResponse {
        if case .online = mode {
            return proxyRequest(method: "POST", path: "/api/cues/\(cueId)/editing", body: body)
        }
        let clientId = body["clientId"] as? String ?? ""
        let userName = body["userName"] as? String ?? ""
        editingLock.lock()
        editingCues[cueId] = ["userName": userName, "clientId": clientId, "startedAt": Date().timeIntervalSince1970]
        editingLock.unlock()
        broadcaster.broadcast(event: [
            "type": "editing-start", "cueId": cueId, "userName": userName,
            "originClientId": clientId
        ])
        return .ok(.json(["success": true] as [String: Any]))
    }

    func handleEditingStop(cueId: String, body: [String: Any], broadcaster: SSEBroadcaster) -> HttpResponse {
        if case .online = mode {
            return proxyRequest(method: "DELETE", path: "/api/cues/\(cueId)/editing", body: body)
        }
        let clientId = body["clientId"] as? String ?? ""
        editingLock.lock()
        editingCues.removeValue(forKey: cueId)
        editingLock.unlock()
        broadcaster.broadcast(event: [
            "type": "editing-stop", "cueId": cueId,
            "originClientId": clientId
        ])
        return .ok(.json(["success": true] as [String: Any]))
    }

    func handleClientDisconnect(clientId: String, broadcaster: SSEBroadcaster) {
        editingLock.lock()
        let toRemove = editingCues.filter { ($0.value["clientId"] as? String) == clientId }
        for (cueId, _) in toRemove {
            editingCues.removeValue(forKey: cueId)
        }
        editingLock.unlock()
        for (cueId, _) in toRemove {
            broadcaster.broadcast(event: [
                "type": "editing-stop", "cueId": cueId,
                "originClientId": clientId
            ])
        }
    }

    // MARK: - Helpers

    private func jsonError(_ status: Int, _ message: String) -> HttpResponse {
        let body: [String: Any] = ["error": message]
        return jsonResponse(status, body)
    }

    private func jsonResponse(_ status: Int, _ body: [String: Any]) -> HttpResponse {
        guard let data = try? JSONSerialization.data(withJSONObject: body) else {
            return .internalServerError
        }
        return .raw(status, "application/json", nil) { writer in
            try writer.write(data)
        }
    }
}
