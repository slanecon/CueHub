import Foundation
import Swifter

/// Embedded HTTP server that serves the web frontend and routes API requests.
/// In online mode, API requests are proxied to the remote server.js.
/// In offline mode, API requests are handled locally against GRDB.
class EmbeddedServer {

    private var server: HttpServer?
    private let router = RequestRouter()
    let sseBroadcaster = SSEBroadcaster()
    private let settings = AppSettings.shared
    private let connectivityMonitor = ConnectivityMonitor()
    private let syncEngine = SyncEngine()
    private let remoteSSEListener = RemoteSSEListener()
    private var isSyncing = false

    /// The local port this embedded server listens on
    let port: UInt16 = 3001

    var isOnline: Bool { router.isOnline }

    func start() {
        let server = HttpServer()
        self.server = server

        // Serve bundled web assets
        registerStaticRoutes(server)

        // API routes
        registerAPIRoutes(server)

        // SSE endpoint
        registerSSERoute(server)

        do {
            try server.start(port, forceIPv4: true)
            print("[EmbeddedServer] Started on port \(port)")
        } catch {
            print("[EmbeddedServer] Failed to start: \(error)")
        }

        // Configure sync engine
        syncEngine.onProgress = { [weak self] step, total, desc in
            print("[Sync] \(step)/\(total): \(desc)")
            self?.sseBroadcaster.broadcast(event: [
                "type": "sync-progress",
                "step": step, "total": total, "description": desc,
                "originClientId": "system"
            ])
        }
        syncEngine.onComplete = { [weak self] result in
            guard let self = self else { return }
            self.isSyncing = false
            print("[Sync] Complete: pushed=\(result.pushed) pulled=\(result.pulled) conflicts=\(result.conflicts) errors=\(result.errors)")
            if result.success {
                self.router.goOnline(serverURL: self.settings.remoteServerURL)
                self.remoteSSEListener.connect(serverURL: self.settings.remoteServerURL)
                self.sseBroadcaster.broadcastConnectionStatus(online: true)
            }
            self.sseBroadcaster.broadcast(event: [
                "type": "sync-complete",
                "pushed": result.pushed, "pulled": result.pulled,
                "conflicts": result.conflicts, "success": result.success,
                "originClientId": "system"
            ])
            // Tell the web frontend to reload data
            self.sseBroadcaster.broadcast(event: [
                "type": "created", "entity": "cue", "id": "",
                "originClientId": "system"
            ])
        }

        // Configure remote SSE listener to forward server.js events to local broadcaster
        remoteSSEListener.onEvent = { [weak self] event in
            guard let self = self else { return }
            // Forward to native bridge (WKWebView) and any local SSE clients
            self.sseBroadcaster.broadcast(event: event)
        }

        // Start connectivity monitoring
        connectivityMonitor.onStatusChanged = { [weak self] online in
            guard let self = self else { return }
            if online {
                self.runSyncIfNeeded()
            } else {
                self.router.goOffline()
                self.remoteSSEListener.disconnect()
            }
            self.sseBroadcaster.broadcastConnectionStatus(online: online)
        }
        connectivityMonitor.serverURL = settings.remoteServerURL
        connectivityMonitor.start()
    }

    func stop() {
        server?.stop()
        connectivityMonitor.stop()
        remoteSSEListener.disconnect()
        print("[EmbeddedServer] Stopped")
    }

    /// Run sync if there are unsynced local changes, then switch to online mode.
    private func runSyncIfNeeded() {
        guard !isSyncing else { return }

        let hasChanges = (try? AppDatabase.shared.unsyncedChanges().count) ?? 0 > 0
        if hasChanges {
            isSyncing = true
            print("[EmbeddedServer] Starting sync with \(hasChanges) pending changes...")
            syncEngine.sync(serverURL: settings.remoteServerURL)
        } else {
            // No local changes — just pull and go online
            isSyncing = true
            syncEngine.onComplete = { [weak self] result in
                guard let self = self else { return }
                self.isSyncing = false
                self.router.goOnline(serverURL: self.settings.remoteServerURL)
                self.remoteSSEListener.connect(serverURL: self.settings.remoteServerURL)
                self.sseBroadcaster.broadcastConnectionStatus(online: true)
                // Trigger data reload
                self.sseBroadcaster.broadcast(event: [
                    "type": "created", "entity": "cue", "id": "",
                    "originClientId": "system"
                ])
            }
            syncEngine.sync(serverURL: settings.remoteServerURL)
        }
    }

    // MARK: - Static Routes

    private func registerStaticRoutes(_ server: HttpServer) {
        // Serve index.html with injected NATIVE_API_BASE
        server["/index.html"] = { [weak self] _ in
            guard let self = self else { return .notFound }
            guard let url = Bundle.main.url(forResource: "index", withExtension: "html"),
                  let data = try? Data(contentsOf: url),
                  var html = String(data: data, encoding: .utf8) else {
                print("[EmbeddedServer] index.html not found in bundle")
                return .notFound
            }
            let injection = "<script>window.NATIVE_API_BASE = 'http://localhost:\(self.port)';</script>"
            html = html.replacingOccurrences(of: "</head>", with: injection + "</head>")
            return .ok(.html(html))
        }

        server["/style.css"] = { _ in
            guard let url = Bundle.main.url(forResource: "style", withExtension: "css"),
                  let data = try? Data(contentsOf: url) else {
                print("[EmbeddedServer] style.css not found in bundle")
                return .notFound
            }
            return .raw(200, "text/css", nil) { writer in try writer.write(data) }
        }

        server["/app.js"] = { _ in
            guard let url = Bundle.main.url(forResource: "app", withExtension: "js"),
                  let data = try? Data(contentsOf: url) else {
                print("[EmbeddedServer] app.js not found in bundle")
                return .notFound
            }
            return .raw(200, "application/javascript", nil) { writer in try writer.write(data) }
        }

        // Root redirects to index.html
        server["/"] = { _ in
            return .movedPermanently("/index.html")
        }
    }

    // MARK: - API Routes

    private func registerAPIRoutes(_ server: HttpServer) {
        // Health check (always local)
        server["/api/health"] = { [weak self] _ in
            let online = self?.router.isOnline ?? false
            let serverReachable = self?.connectivityMonitor.isOnline ?? false
            let mode = online ? "online" : (serverReachable ? "syncing" : "offline")
            return .ok(.json(["status": "ok", "mode": mode] as [String: Any]))
        }

        // Cues
        server["/api/cues"] = { [weak self] request in
            guard let self = self else { return .internalServerError }
            if request.method == "GET" {
                let since = request.queryParams.first(where: { $0.0 == "since" })?.1
                return self.router.handleGetCues(since: since)
            } else if request.method == "POST" {
                return self.router.handlePostCue(body: request.bodyDict, broadcaster: self.sseBroadcaster)
            }
            return .badRequest(nil)
        }

        server["/api/cues/:id"] = { [weak self] request in
            guard let self = self else { return .internalServerError }
            let id = request.params[":id"] ?? ""
            switch request.method {
            case "GET":
                return self.router.handleGetCue(id: id)
            case "PUT":
                return self.router.handlePutCue(id: id, body: request.bodyDict, broadcaster: self.sseBroadcaster)
            case "DELETE":
                return self.router.handleDeleteCue(id: id, body: request.bodyDict, broadcaster: self.sseBroadcaster)
            default:
                return .badRequest(nil)
            }
        }

        // Editing status
        server["/api/cues/:id/editing"] = { [weak self] request in
            guard let self = self else { return .internalServerError }
            let id = request.params[":id"] ?? ""
            if request.method == "POST" {
                return self.router.handleEditingStart(cueId: id, body: request.bodyDict, broadcaster: self.sseBroadcaster)
            } else if request.method == "DELETE" {
                return self.router.handleEditingStop(cueId: id, body: request.bodyDict, broadcaster: self.sseBroadcaster)
            }
            return .badRequest(nil)
        }
    }

    // MARK: - SSE Route

    private func registerSSERoute(_ server: HttpServer) {
        server["/api/events"] = { [weak self] request in
            guard let self = self else { return .internalServerError }

            return .raw(200, "text/event-stream", [
                "Cache-Control": "no-cache",
                "Connection": "keep-alive"
            ]) { writer in
                let clientId = UUID().uuidString
                print("[SSE] Setting up client \(clientId)")

                // Send connected event
                do {
                    let connectedData: [String: Any] = [
                        "clientId": clientId,
                        "editingState": self.router.editingState
                    ]
                    print("[SSE] editingState: \(self.router.editingState)")
                    let json = try JSONSerialization.data(withJSONObject: connectedData)
                    let str = String(data: json, encoding: .utf8) ?? "{}"
                    print("[SSE] Sending connected event: \(str.prefix(200))")
                    let sseMessage = "event: connected\ndata: \(str)\n\n"
                    try writer.write(sseMessage.data(using: .utf8)!)
                    print("[SSE] Connected event sent successfully")
                } catch {
                    print("[SSE] ERROR sending connected event: \(error)")
                    return
                }

                // Register this client for future broadcasts
                self.sseBroadcaster.addClient(id: clientId, writer: writer)

                // Send current connection status immediately
                do {
                    let online = self.router.isOnline || self.connectivityMonitor.isOnline
                    let statusData: [String: Any] = [
                        "type": "connection-status",
                        "online": online,
                        "originClientId": "system"
                    ]
                    let statusJson = try JSONSerialization.data(withJSONObject: statusData)
                    let statusStr = String(data: statusJson, encoding: .utf8) ?? "{}"
                    print("[SSE] Sending connection-status: \(statusStr)")
                    let sseMessage = "event: update\ndata: \(statusStr)\n\n"
                    try writer.write(sseMessage.data(using: .utf8)!)
                    print("[SSE] Connection-status sent successfully")
                } catch {
                    print("[SSE] ERROR sending connection-status: \(error)")
                    // Don't return — keep the connection alive even if this write failed
                }

                // Keep connection alive — the broadcaster will push events
                // This blocks until the client disconnects
                print("[SSE] Entering keepalive loop for \(clientId)")
                while true {
                    Thread.sleep(forTimeInterval: 30)
                    do {
                        try writer.write(": keepalive\n\n".data(using: .utf8)!)
                    } catch {
                        print("[SSE] Keepalive failed for \(clientId): \(error)")
                        break
                    }
                }

                self.sseBroadcaster.removeClient(id: clientId)
                self.router.handleClientDisconnect(clientId: clientId, broadcaster: self.sseBroadcaster)
            }
        }
    }
}

// MARK: - HttpRequest helpers

extension HttpRequest {
    /// Parse JSON body into a dictionary
    var bodyDict: [String: Any] {
        guard !body.isEmpty else { return [:] }
        let data = Data(body)
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }
}
