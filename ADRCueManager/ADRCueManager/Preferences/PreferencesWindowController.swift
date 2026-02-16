import Cocoa

class PreferencesWindowController: NSWindowController {

    private let serverHostField = NSTextField()
    private let serverPortField = NSTextField()
    private let userNameField = NSTextField()

    convenience init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 400, height: 200),
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
        var y: CGFloat = 140

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

        y -= 34

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
}
