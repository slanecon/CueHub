import Cocoa

class PreferencesWindowController: NSWindowController {

    private let serverHostField = NSTextField()
    private let serverPortField = NSTextField()
    private let userNameField = NSTextField()
    private let connectionStatusField = NSTextField(labelWithString: "")

    convenience init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 400, height: 240),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        window.title = "Preferences"
        window.center()
        window.isReleasedWhenClosed = false

        self.init(window: window)
        setupUI()
        loadSettings()
    }

    private func setupUI() {
        guard let contentView = window?.contentView else { return }

        let padding: CGFloat = 20
        let labelWidth: CGFloat = 100
        let fieldHeight: CGFloat = 22
        var y: CGFloat = 180

        // Server Host
        let hostLabel = NSTextField(labelWithString: "Server Host:")
        hostLabel.frame = NSRect(x: padding, y: y, width: labelWidth, height: fieldHeight)
        hostLabel.alignment = .right
        contentView.addSubview(hostLabel)

        serverHostField.frame = NSRect(x: padding + labelWidth + 8, y: y, width: 240, height: fieldHeight)
        serverHostField.placeholderString = "localhost"
        contentView.addSubview(serverHostField)

        y -= 34

        // Server Port
        let portLabel = NSTextField(labelWithString: "Server Port:")
        portLabel.frame = NSRect(x: padding, y: y, width: labelWidth, height: fieldHeight)
        portLabel.alignment = .right
        contentView.addSubview(portLabel)

        serverPortField.frame = NSRect(x: padding + labelWidth + 8, y: y, width: 80, height: fieldHeight)
        serverPortField.placeholderString = "3000"
        contentView.addSubview(serverPortField)

        // Test Connection button
        let testBtn = NSButton(title: "Test Connection", target: self, action: #selector(testConnection))
        testBtn.frame = NSRect(x: padding + labelWidth + 96, y: y - 3, width: 140, height: 28)
        testBtn.bezelStyle = .rounded
        contentView.addSubview(testBtn)

        y -= 28

        // Connection status label
        connectionStatusField.frame = NSRect(x: padding + labelWidth + 8, y: y, width: 240, height: fieldHeight)
        connectionStatusField.font = NSFont.systemFont(ofSize: 11)
        connectionStatusField.textColor = .secondaryLabelColor
        contentView.addSubview(connectionStatusField)

        y -= 30

        // User Name
        let nameLabel = NSTextField(labelWithString: "Your Name:")
        nameLabel.frame = NSRect(x: padding, y: y, width: labelWidth, height: fieldHeight)
        nameLabel.alignment = .right
        contentView.addSubview(nameLabel)

        userNameField.frame = NSRect(x: padding + labelWidth + 8, y: y, width: 240, height: fieldHeight)
        userNameField.placeholderString = "Enter your name"
        contentView.addSubview(userNameField)

        y -= 40

        // Save button
        let saveBtn = NSButton(title: "Save", target: self, action: #selector(saveSettings))
        saveBtn.frame = NSRect(x: 300, y: y, width: 80, height: 28)
        saveBtn.bezelStyle = .rounded
        saveBtn.keyEquivalent = "\r"
        contentView.addSubview(saveBtn)
    }

    private func loadSettings() {
        let settings = AppSettings.shared
        serverHostField.stringValue = settings.serverHost
        serverPortField.stringValue = String(settings.serverPort)
        userNameField.stringValue = settings.userName
    }

    @objc private func saveSettings() {
        let settings = AppSettings.shared
        settings.serverHost = serverHostField.stringValue
        settings.serverPort = Int(serverPortField.stringValue) ?? 3000
        settings.userName = userNameField.stringValue
        window?.close()
    }

    @objc private func testConnection() {
        let host = serverHostField.stringValue.isEmpty ? "localhost" : serverHostField.stringValue
        let port = Int(serverPortField.stringValue) ?? 3000
        let urlString = "http://\(host):\(port)/api/health"

        connectionStatusField.stringValue = "Testing..."
        connectionStatusField.textColor = .secondaryLabelColor

        guard let url = URL(string: urlString) else {
            connectionStatusField.stringValue = "Invalid host or port"
            connectionStatusField.textColor = .systemRed
            return
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 5

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if let error = error {
                    self.connectionStatusField.stringValue = "Failed: \(error.localizedDescription)"
                    self.connectionStatusField.textColor = .systemRed
                    return
                }
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                if statusCode == 200 {
                    self.connectionStatusField.stringValue = "Connected to server"
                    self.connectionStatusField.textColor = .systemGreen
                } else {
                    self.connectionStatusField.stringValue = "Server returned HTTP \(statusCode)"
                    self.connectionStatusField.textColor = .systemOrange
                }
            }
        }.resume()
    }
}
