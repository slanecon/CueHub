import Foundation

/// Connects to server.js's SSE endpoint and forwards events to the local broadcaster.
/// This allows the desktop app to receive real-time updates from other web clients.
class RemoteSSEListener: NSObject, URLSessionDataDelegate {

    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var buffer = ""

    /// Called when an SSE event is received from the remote server
    var onEvent: (([String: Any]) -> Void)?

    func connect(serverURL: String) {
        disconnect()

        guard let url = URL(string: "\(serverURL)/api/events") else { return }
        print("[RemoteSSE] Connecting to \(url)")

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = TimeInterval(Int.max)
        config.timeoutIntervalForResource = TimeInterval(Int.max)
        session = URLSession(configuration: config, delegate: self, delegateQueue: nil)

        var request = URLRequest(url: url)
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        task = session?.dataTask(with: request)
        task?.resume()
    }

    func disconnect() {
        task?.cancel()
        task = nil
        session?.invalidateAndCancel()
        session = nil
        buffer = ""
    }

    // MARK: - URLSessionDataDelegate

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let text = String(data: data, encoding: .utf8) else { return }
        buffer += text
        processBuffer()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error as? NSError, error.code == NSURLErrorCancelled {
            return // intentional disconnect
        }
        print("[RemoteSSE] Connection closed: \(error?.localizedDescription ?? "no error")")
        // Reconnect after a delay
        DispatchQueue.global().asyncAfter(deadline: .now() + 3) { [weak self] in
            guard let self = self, self.task != nil else { return }
            if let url = task.originalRequest?.url?.deletingLastPathComponent().absoluteString {
                self.connect(serverURL: String(url.dropLast())) // remove trailing /
            }
        }
    }

    // MARK: - SSE Parsing

    private func processBuffer() {
        // SSE events are separated by double newlines
        while let range = buffer.range(of: "\n\n") {
            let block = String(buffer[buffer.startIndex..<range.lowerBound])
            buffer = String(buffer[range.upperBound...])
            parseSSEBlock(block)
        }
    }

    private func parseSSEBlock(_ block: String) {
        var eventType = "message"
        var dataLines: [String] = []

        for line in block.components(separatedBy: "\n") {
            if line.hasPrefix("event: ") {
                eventType = String(line.dropFirst(7))
            } else if line.hasPrefix("data: ") {
                dataLines.append(String(line.dropFirst(6)))
            } else if line.hasPrefix(":") {
                // Comment line (keepalive), ignore
                continue
            }
        }

        guard !dataLines.isEmpty else { return }
        let dataStr = dataLines.joined(separator: "\n")

        // We only care about "update" events (data changes, editing, etc.)
        guard eventType == "update" else { return }

        guard let jsonData = dataStr.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] else { return }

        DispatchQueue.main.async { [weak self] in
            self?.onEvent?(dict)
        }
    }
}
