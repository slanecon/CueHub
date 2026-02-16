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

        // Start connectivity monitoring
        connectivityMonitor.onStatusChanged = { [weak self] online in
            guard let self = self else { return }
            if online {
                self.router.goOnline(serverURL: self.settings.remoteServerURL)
            } else {
                self.router.goOffline()
            }
            // Notify via SSE
            self.sseBroadcaster.broadcastConnectionStatus(online: online)
        }
        connectivityMonitor.serverURL = settings.remoteServerURL
        connectivityMonitor.start()
    }

    func stop() {
        server?.stop()
        connectivityMonitor.stop()
        print("[EmbeddedServer] Stopped")
    }

    // MARK: - Static Routes

    private func registerStaticRoutes(_ server: HttpServer) {
        let bundle = Bundle.main
        let webDir = bundle.resourcePath.map { $0 + "/Web" }

        // Serve index.html with injected NATIVE_API_BASE
        server["/index.html"] = { [weak self] _ in
            guard let self = self else { return .notFound }
            if let dir = webDir, let data = FileManager.default.contents(atPath: dir + "/index.html"),
               var html = String(data: data, encoding: .utf8) {
                // Inject native API base before closing </head>
                let injection = "<script>window.NATIVE_API_BASE = 'http://localhost:\(self.port)';</script>"
                html = html.replacingOccurrences(of: "</head>", with: injection + "</head>")
                return .ok(.html(html))
            }
            // Fall back to fetching from remote server
            return .notFound
        }

        server["/style.css"] = { _ in
            if let dir = webDir, let data = FileManager.default.contents(atPath: dir + "/style.css") {
                return .raw(200, "text/css", nil) { writer in try writer.write(data) }
            }
            return .notFound
        }

        server["/app.js"] = { _ in
            if let dir = webDir, let data = FileManager.default.contents(atPath: dir + "/app.js") {
                return .raw(200, "application/javascript", nil) { writer in try writer.write(data) }
            }
            return .notFound
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
            return .ok(.json(["status": "ok", "mode": online ? "online" : "offline"] as [String: Any]))
        }

        // Characters
        server["/api/characters"] = { [weak self] request in
            guard let self = self else { return .internalServerError }
            if request.method == "GET" {
                return self.router.handleGetCharacters()
            } else if request.method == "POST" {
                return self.router.handlePostCharacter(body: request.bodyDict, broadcaster: self.sseBroadcaster)
            }
            return .badRequest(nil)
        }

        server["/api/characters/:id"] = { [weak self] request in
            guard let self = self else { return .internalServerError }
            let id = request.params[":id"] ?? ""
            if request.method == "DELETE" {
                return self.router.handleDeleteCharacter(id: id, body: request.bodyDict, broadcaster: self.sseBroadcaster)
            }
            return .badRequest(nil)
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

                // Send connected event
                let connectedData: [String: Any] = [
                    "clientId": clientId,
                    "editingState": self.router.editingState
                ]
                if let json = try? JSONSerialization.data(withJSONObject: connectedData),
                   let str = String(data: json, encoding: .utf8) {
                    try writer.write("event: connected\ndata: \(str)\n\n".data(using: .utf8)!)
                }

                // Register this client for future broadcasts
                self.sseBroadcaster.addClient(id: clientId, writer: writer)

                // Keep connection alive — the broadcaster will push events
                // This blocks until the client disconnects
                while true {
                    Thread.sleep(forTimeInterval: 30)
                    // Send a keepalive comment
                    do {
                        try writer.write(": keepalive\n\n".data(using: .utf8)!)
                    } catch {
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
