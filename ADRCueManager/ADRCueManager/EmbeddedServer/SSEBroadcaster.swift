import Foundation
import Swifter

/// Manages SSE client connections and broadcasts events.
class SSEBroadcaster {

    private var clients: [(id: String, writer: HttpResponseBodyWriter)] = []
    private let lock = NSLock()

    func addClient(id: String, writer: HttpResponseBodyWriter) {
        lock.lock()
        clients.append((id: id, writer: writer))
        lock.unlock()
        print("[SSE] Client connected: \(id) (total: \(clients.count))")
    }

    func removeClient(id: String) {
        lock.lock()
        clients.removeAll { $0.id == id }
        lock.unlock()
        print("[SSE] Client disconnected: \(id)")
    }

    /// Broadcast an event to all connected SSE clients
    func broadcast(event: [String: Any]) {
        guard let json = try? JSONSerialization.data(withJSONObject: event),
              let str = String(data: json, encoding: .utf8) else { return }

        let message = "event: update\ndata: \(str)\n\n"
        guard let data = message.data(using: .utf8) else { return }

        lock.lock()
        var toRemove: [String] = []
        for client in clients {
            do {
                try client.writer.write(data)
            } catch {
                toRemove.append(client.id)
            }
        }
        clients.removeAll { toRemove.contains($0.id) }
        lock.unlock()
    }

    /// Broadcast a connection status change
    func broadcastConnectionStatus(online: Bool) {
        broadcast(event: [
            "type": "connection-status",
            "online": online,
            "originClientId": "system"
        ])
    }
}
