import Cocoa
import WebKit

class WebViewController: NSViewController, WKScriptMessageHandler, WKNavigationDelegate {

    private var webView: WKWebView!

    /// Callback when JS reports selection changes: (selectedCount, totalCount)
    var onSelectionChanged: ((Int, Int) -> Void)?

    override func loadView() {
        let config = WKWebViewConfiguration()
        let userContentController = WKUserContentController()

        // Register message handlers for native bridge
        userContentController.add(self, name: "selectionChanged")
        userContentController.add(self, name: "connectionStatus")
        userContentController.add(self, name: "requestPreferences")

        // Inject the native bridge setup script
        let bridgeScript = WKUserScript(source: nativeBridgeJS(), injectionTime: .atDocumentStart, forMainFrameOnly: true)
        userContentController.addUserScript(bridgeScript)

        config.userContentController = userContentController

        // Allow local network access
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self

        #if DEBUG
        // Enable developer tools in debug builds
        webView.configuration.preferences.setValue(true, forKey: "developerExtrasEnabled")
        #endif

        self.view = webView
        loadContent()
    }

    private func loadContent() {
        let localPort = AppSettings.shared.localServerPort
        guard let url = URL(string: "http://localhost:\(localPort)/index.html") else { return }
        webView.load(URLRequest(url: url))
    }

    func reload() {
        loadContent()
    }

    // MARK: - JS Bridge

    func sendToolbarAction(_ action: String) {
        let js = "window.nativeBridge.triggerToolbarAction('\(action)');"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    func setConnectionStatus(_ status: String) {
        let js = "window.nativeBridge.setConnectionStatus('\(status)');"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.name {
        case "selectionChanged":
            if let body = message.body as? [String: Int],
               let selected = body["selected"],
               let total = body["total"] {
                DispatchQueue.main.async { [weak self] in
                    self?.onSelectionChanged?(selected, total)
                }
            }
        case "connectionStatus":
            if let status = message.body as? String {
                print("Connection status: \(status)")
            }
        case "requestPreferences":
            // Forward to app delegate
            if let appDelegate = NSApp.delegate as? AppDelegate {
                appDelegate.perform(Selector(("showPreferences")))
            }
        default:
            break
        }
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("WebView navigation failed: \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        // Embedded server may not be ready yet — retry after a short delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.loadContent()
        }
    }

    // MARK: - Native Bridge JS

    private func nativeBridgeJS() -> String {
        let localPort = AppSettings.shared.localServerPort
        return """
        // Set API base for the web frontend — always points to the embedded server
        window.NATIVE_API_BASE = 'http://localhost:\(localPort)';

        // Override nativeBridge.onSelectionChanged to post to native
        window.addEventListener('DOMContentLoaded', function() {
            if (!window.nativeBridge) window.nativeBridge = {};
            var origOnSelection = window.nativeBridge.onSelectionChanged;
            window.nativeBridge.onSelectionChanged = function(selected, total) {
                try {
                    window.webkit.messageHandlers.selectionChanged.postMessage({selected: selected, total: total});
                } catch(e) {}
                if (origOnSelection) origOnSelection(selected, total);
            };
        });
        """
    }
}
