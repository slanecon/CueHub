import Cocoa
import WebKit

class MainWindowController: NSWindowController, NSToolbarDelegate {

    private(set) var webViewController: WebViewController!
    private var statusBar: StatusBarView!

    // Toolbar item identifiers
    private let toolbarAddID = NSToolbarItem.Identifier("add")
    private let toolbarDuplicateID = NSToolbarItem.Identifier("duplicate")
    private let toolbarEditID = NSToolbarItem.Identifier("edit")
    private let toolbarDeleteID = NSToolbarItem.Identifier("delete")
    private let toolbarSpaceID = NSToolbarItem.Identifier.flexibleSpace
    private let toolbarConnectionID = NSToolbarItem.Identifier("connection")

    convenience init() {
        // Create the window
        let contentRect = NSRect(x: 0, y: 0, width: 1200, height: 700)
        let styleMask: NSWindow.StyleMask = [.titled, .closable, .miniaturizable, .resizable]
        let window = NSWindow(contentRect: contentRect, styleMask: styleMask, backing: .buffered, defer: false)
        window.title = "Cue Hub"
        window.minSize = NSSize(width: 1024, height: 500)
        window.center()
        window.isReleasedWhenClosed = false

        self.init(window: window)

        setupContent()
        setupToolbar()
    }

    private func setupContent() {
        guard let window = window else { return }

        // Create a vertical stack: webview + status bar
        let container = NSView()
        container.translatesAutoresizingMaskIntoConstraints = false

        // Web view
        webViewController = WebViewController()
        let webView = webViewController.view
        webView.translatesAutoresizingMaskIntoConstraints = false

        // Status bar
        statusBar = StatusBarView()
        statusBar.translatesAutoresizingMaskIntoConstraints = false

        container.addSubview(webView)
        container.addSubview(statusBar)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: container.topAnchor),
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: statusBar.topAnchor),

            statusBar.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            statusBar.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            statusBar.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            statusBar.heightAnchor.constraint(equalToConstant: 22),
        ])

        window.contentView = container

        // Wire up the native bridge callback for status bar updates
        webViewController.onSelectionChanged = { [weak self] selected, total in
            self?.statusBar.update(selected: selected, total: total)
        }
    }

    private func setupToolbar() {
        guard let window = window else { return }
        let toolbar = NSToolbar(identifier: "MainToolbar")
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        toolbar.allowsUserCustomization = false
        window.toolbar = toolbar
    }

    // MARK: - NSToolbarDelegate

    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier itemIdentifier: NSToolbarItem.Identifier, willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        switch itemIdentifier {
        case toolbarAddID:
            return makeToolbarItem(id: itemIdentifier, label: "Add", icon: "plus", action: #selector(toolbarAdd))
        case toolbarDuplicateID:
            return makeToolbarItem(id: itemIdentifier, label: "Duplicate", icon: "doc.on.doc", action: #selector(toolbarDuplicate))
        case toolbarEditID:
            return makeToolbarItem(id: itemIdentifier, label: "Edit", icon: "pencil", action: #selector(toolbarEdit))
        case toolbarDeleteID:
            return makeToolbarItem(id: itemIdentifier, label: "Delete", icon: "trash", action: #selector(toolbarDelete))
        default:
            return nil
        }
    }

    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        return [toolbarAddID, toolbarDuplicateID, toolbarEditID, toolbarDeleteID, toolbarSpaceID]
    }

    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        return toolbarDefaultItemIdentifiers(toolbar)
    }

    private func makeToolbarItem(id: NSToolbarItem.Identifier, label: String, icon: String, action: Selector) -> NSToolbarItem {
        let item = NSToolbarItem(itemIdentifier: id)
        item.label = label
        item.toolTip = label
        item.target = self
        item.action = action
        if let image = NSImage(systemSymbolName: icon, accessibilityDescription: label) {
            item.image = image
        }
        return item
    }

    // MARK: - Toolbar Actions

    @objc func toolbarAdd() {
        webViewController.sendToolbarAction("add")
    }

    @objc func toolbarDuplicate() {
        webViewController.sendToolbarAction("duplicate")
    }

    @objc func toolbarEdit() {
        webViewController.sendToolbarAction("edit")
    }

    @objc func toolbarDelete() {
        webViewController.sendToolbarAction("delete")
    }

    @objc func reloadWebView() {
        webViewController.reload()
    }
}
