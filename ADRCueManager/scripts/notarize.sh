#!/bin/bash
# Notarization script for ADR Cue Manager
# Prerequisites:
#   - Xcode installed with "Developer ID Application" certificate
#   - App Store Connect API key or Apple ID credentials stored in Keychain
#   - Run from the ADRCueManager/ project directory
#
# Usage:
#   ./scripts/notarize.sh
#   ./scripts/notarize.sh --team-id YOUR_TEAM_ID
#   ./scripts/notarize.sh --apple-id you@example.com --password @keychain:AC_PASSWORD

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCHEME="ADRCueManager"
ARCHIVE_PATH="$PROJECT_DIR/build/ADRCueManager.xcarchive"
EXPORT_PATH="$PROJECT_DIR/build/export"
EXPORT_OPTIONS="$PROJECT_DIR/ExportOptions.plist"
APP_PATH="$EXPORT_PATH/ADRCueManager.app"
ZIP_PATH="$PROJECT_DIR/build/ADRCueManager.zip"

# Parse optional arguments
TEAM_ID=""
APPLE_ID=""
PASSWORD=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --team-id) TEAM_ID="$2"; shift 2 ;;
        --apple-id) APPLE_ID="$2"; shift 2 ;;
        --password) PASSWORD="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

echo "=== Step 1: Clean build directory ==="
rm -rf "$PROJECT_DIR/build"
mkdir -p "$PROJECT_DIR/build"

echo "=== Step 2: Archive ==="
ARCHIVE_CMD=(xcodebuild archive
    -project "$PROJECT_DIR/ADRCueManager.xcodeproj"
    -scheme "$SCHEME"
    -archivePath "$ARCHIVE_PATH"
    -configuration Release
)
if [[ -n "$TEAM_ID" ]]; then
    ARCHIVE_CMD+=(DEVELOPMENT_TEAM="$TEAM_ID")
fi
"${ARCHIVE_CMD[@]}"

echo "=== Step 3: Export archive ==="
xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$EXPORT_PATH" \
    -exportOptionsPlist "$EXPORT_OPTIONS"

if [[ ! -d "$APP_PATH" ]]; then
    echo "ERROR: Export failed — $APP_PATH not found"
    exit 1
fi

echo "=== Step 4: Create ZIP for notarization ==="
ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"

echo "=== Step 5: Submit for notarization ==="
NOTARIZE_CMD=(xcrun notarytool submit "$ZIP_PATH" --wait)
if [[ -n "$APPLE_ID" && -n "$PASSWORD" ]]; then
    NOTARIZE_CMD+=(--apple-id "$APPLE_ID" --password "$PASSWORD")
    if [[ -n "$TEAM_ID" ]]; then
        NOTARIZE_CMD+=(--team-id "$TEAM_ID")
    fi
elif [[ -n "$TEAM_ID" ]]; then
    # Use keychain profile (set up with: xcrun notarytool store-credentials)
    NOTARIZE_CMD+=(--keychain-profile "AC_PASSWORD")
fi
"${NOTARIZE_CMD[@]}"

echo "=== Step 6: Staple notarization ticket ==="
xcrun stapler staple "$APP_PATH"

echo ""
echo "=== Done! ==="
echo "Notarized app: $APP_PATH"
echo ""
echo "To create a DMG for distribution:"
echo "  hdiutil create -volname 'ADR Cue Manager' -srcfolder '$EXPORT_PATH' -ov -format UDZO '$PROJECT_DIR/build/ADRCueManager.dmg'"
