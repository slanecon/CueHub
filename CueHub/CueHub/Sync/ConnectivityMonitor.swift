import Foundation
import Network

/// Monitors network availability and probes the remote server.js for connectivity.
class ConnectivityMonitor {

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "connectivity-monitor")
    private var probeTimer: Timer?
    private var networkAvailable = false

    var serverURL: String = "http://localhost:3000"
    var onStatusChanged: ((Bool) -> Void)?

    private(set) var isOnline = false

    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            let available = path.status == .satisfied
            self?.networkAvailable = available
            if available {
                self?.probeServer()
            } else {
                self?.setOnline(false)
            }
        }
        monitor.start(queue: queue)

        // Periodic probe every 30 seconds when offline
        DispatchQueue.main.async { [weak self] in
            self?.probeTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
                if !(self?.isOnline ?? false) {
                    self?.probeServer()
                }
            }
        }

        // Initial probe
        probeServer()
    }

    func stop() {
        monitor.cancel()
        probeTimer?.invalidate()
        probeTimer = nil
    }

    private func probeServer() {
        guard let url = URL(string: "\(serverURL)/api/health") else {
            setOnline(false)
            return
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 2.0

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            let reachable = (response as? HTTPURLResponse)?.statusCode == 200
            self?.setOnline(reachable)
        }.resume()
    }

    private func setOnline(_ online: Bool) {
        guard online != isOnline else { return }
        isOnline = online
        DispatchQueue.main.async { [weak self] in
            self?.onStatusChanged?(online)
        }
    }
}
