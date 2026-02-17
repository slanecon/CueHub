import Foundation

class AppSettings {
    static let shared = AppSettings()

    private let defaults = UserDefaults.standard

    var serverHost: String {
        get { defaults.string(forKey: "serverHost") ?? "localhost" }
        set { defaults.set(newValue, forKey: "serverHost") }
    }

    var serverPort: Int {
        get {
            let port = defaults.integer(forKey: "serverPort")
            return port > 0 ? port : 3000
        }
        set { defaults.set(newValue, forKey: "serverPort") }
    }

    var userName: String {
        get { defaults.string(forKey: "userName") ?? "" }
        set { defaults.set(newValue, forKey: "userName") }
    }

    var lastSyncTimestamp: String? {
        get { defaults.string(forKey: "lastSyncTimestamp") }
        set { defaults.set(newValue, forKey: "lastSyncTimestamp") }
    }

    /// The port the embedded local HTTP server listens on (WKWebView connects here)
    var localServerPort: Int { 3001 }

    /// URL of the remote server.js
    var remoteServerURL: String {
        return "http://\(serverHost):\(serverPort)"
    }

    private init() {}
}
