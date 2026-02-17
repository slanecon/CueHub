#!/usr/bin/env swift
// Generates app icon PNGs from SF Symbols
// Usage: swift generate_icon.swift [output_directory]

import AppKit

func renderIcon(pixelSize: Int, outputPath: String) {
    // Create a bitmap context at exact pixel dimensions (no Retina scaling)
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: pixelSize,
        pixelsHigh: pixelSize,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    )!
    rep.size = NSSize(width: pixelSize, height: pixelSize)

    let context = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context

    let rect = NSRect(x: 0, y: 0, width: pixelSize, height: pixelSize)

    // Background: rounded rect with gradient
    let cornerRadius = CGFloat(pixelSize) * 0.22
    let bgPath = NSBezierPath(roundedRect: rect, xRadius: cornerRadius, yRadius: cornerRadius)

    let gradient = NSGradient(
        starting: NSColor(red: 0.15, green: 0.25, blue: 0.45, alpha: 1.0),
        ending: NSColor(red: 0.08, green: 0.12, blue: 0.28, alpha: 1.0)
    )!
    gradient.draw(in: bgPath, angle: -90)

    // Draw mic symbol
    let micConfig = NSImage.SymbolConfiguration(pointSize: CGFloat(pixelSize) * 0.35, weight: .medium)
    if let micImage = NSImage(systemSymbolName: "mic.fill", accessibilityDescription: nil)?
        .withSymbolConfiguration(micConfig) {
        let micSize = micImage.size
        let micX = CGFloat(pixelSize) * 0.5 - micSize.width * 0.5
        let micY = CGFloat(pixelSize) * 0.3
        NSColor.white.withAlphaComponent(0.95).setFill()
        micImage.draw(in: NSRect(x: micX, y: micY, width: micSize.width, height: micSize.height),
                      from: .zero, operation: .sourceOver, fraction: 1.0)
    }

    // Draw film strip accent at bottom
    let filmConfig = NSImage.SymbolConfiguration(pointSize: CGFloat(pixelSize) * 0.15, weight: .medium)
    if let filmImage = NSImage(systemSymbolName: "film", accessibilityDescription: nil)?
        .withSymbolConfiguration(filmConfig) {
        let filmSize = filmImage.size
        let filmX = CGFloat(pixelSize) * 0.5 - filmSize.width * 0.5
        let filmY = CGFloat(pixelSize) * 0.12
        NSColor.white.withAlphaComponent(0.6).setFill()
        filmImage.draw(in: NSRect(x: filmX, y: filmY, width: filmSize.width, height: filmSize.height),
                       from: .zero, operation: .sourceOver, fraction: 0.6)
    }

    NSGraphicsContext.restoreGraphicsState()

    // Write PNG
    guard let pngData = rep.representation(using: .png, properties: [:]) else {
        print("Failed to create PNG for \(outputPath)")
        return
    }

    do {
        try pngData.write(to: URL(fileURLWithPath: outputPath))
        print("Created: \(outputPath) (\(pixelSize)x\(pixelSize))")
    } catch {
        print("Error writing \(outputPath): \(error)")
    }
}

let basePath = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : "CueHub/CueHub/Assets.xcassets/AppIcon.appiconset"

// macOS icon sizes — pixel dimensions for each entry
// For @1x, pixel size = point size. For @2x, pixel size = point size * 2.
let sizes: [(pixels: Int, filename: String)] = [
    (16,   "icon_16x16.png"),
    (32,   "icon_16x16@2x.png"),
    (32,   "icon_32x32.png"),
    (64,   "icon_32x32@2x.png"),
    (128,  "icon_128x128.png"),
    (256,  "icon_128x128@2x.png"),
    (256,  "icon_256x256.png"),
    (512,  "icon_256x256@2x.png"),
    (512,  "icon_512x512.png"),
    (1024, "icon_512x512@2x.png"),
]

for entry in sizes {
    renderIcon(pixelSize: entry.pixels, outputPath: "\(basePath)/\(entry.filename)")
}
print("Done!")
