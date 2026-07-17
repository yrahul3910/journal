# JournalBear — native macOS & iOS

A native SwiftUI build of JournalBear, maintained alongside the cross-platform
Electron app. One multiplatform target builds for macOS and iOS/iPadOS (26+),
using native widgets and Liquid Glass.

## Requirements
- Xcode 26+ and macOS 26+ (Liquid Glass + the 26 SDKs).
- For iOS: the iOS 26 SDK / simulator runtime.

App Store releases are covered separately in [PUBLISHING.md](PUBLISHING.md).

## Build & run
Open `JournalBear.xcodeproj` in Xcode and press Run (⌘R). With **Team = None**,
Xcode signs "to run locally" — no Apple Developer Program / $99 fee needed for
personal use.

From the command line:
```sh
DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer" \
  xcodebuild -project JournalBear.xcodeproj -scheme JournalBear \
  -configuration Debug ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO \
  SYMROOT="$PWD/build" build
# arm64 requires a signature to launch; ad-hoc sign the result:
codesign --force --deep -s - "build/Debug/JournalBear for Mac.app"
open "build/Debug/JournalBear for Mac.app"
```

For the iOS simulator (same scheme, different destination):
```sh
xcodebuild -project JournalBear.xcodeproj -scheme JournalBear \
  -configuration Debug -destination 'generic/platform=iOS Simulator' build
xcrun simctl boot "iPhone 17 Pro"
xcrun simctl install "iPhone 17 Pro" "Build/Products/Debug-iphonesimulator/JournalBear.app"
xcrun simctl launch "iPhone 17 Pro" com.yrahul.JournalBear
```
Running on a physical device requires setting a development team.

The project uses Xcode 16+ filesystem-synchronized groups, so new files added
under `JournalBear/`, `JournalBearTests/`, or `JournalBearUITests/` are picked up
automatically — no `project.pbxproj` edits.

## Tests
The `JournalBear` scheme runs the hosted Swift Testing target `JournalBearTests`
and the `JournalBearUITests` target. Both run on macOS and the iOS simulator:
```sh
xcodebuild test -project JournalBear.xcodeproj -scheme JournalBear \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```
Tests that drive macOS-only UI (the file panels, the sidebar-search Return-key
workaround) skip themselves on iOS via `XCTSkip`. UI tests fail their first
launch if an Xcode-debugged instance of the app is already running — quit it
first. The UI test verifies that pressing Return in
the native search field filters the sidebar without requiring another filter.
Run in Xcode with Cmd-U, or from the command line:
```sh
DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer" \
  xcodebuild test -project JournalBear.xcodeproj -scheme JournalBear \
  -destination 'platform=macOS,arch=arm64' \
  CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM=""
```
The read-path tests open `test_journal.zjournal` from the repo root (gitignored;
its password is embedded in the test). When the write path lands, add round-trip
tests that build → save → reopen → assert, so no committed fixture or password
is needed.

## Layout
- `JournalBear/JournalBearApp.swift` — app entry, menu commands.
- `JournalBear/ContentView.swift` — split-view UI, entry list/detail, password sheet.
- `JournalBear/JournalStore.swift` — observable state; open/decrypt flow.
- `JournalBear/Models/Journal.swift` — `JournalData` / `JournalEntry` (lenient decoding).
- `JournalBear/Core/` — the `.zjournal` read pipeline:
  - `Crypto.swift` — PBKDF2-HMAC-SHA256 (100k rounds) + AES-256-CBC (CommonCrypto).
  - `Gzip.swift` — gzip header strip + raw DEFLATE inflate (Compression framework).
  - `Tar.swift` — minimal USTAR reader.
  - `JournalFile.swift` — orchestrates decrypt → gunzip → untar → parse `data.json`.

## File format
`.zjournal` = `[16-byte salt][16-byte IV][AES-256-CBC ciphertext]`, where the
plaintext is a gzip-compressed tar of `data.json` plus an `images/` directory.
This matches the Electron app's `src/main/encryption.ts` and `archive.ts`.

## Status
Targets the **7.0 format only** — no legacy fallbacks. Read path: opens and
decrypts a `.zjournal`, lists entries, renders structured Markdown entry content
with Textual, and renders image attachments inline (every image is a plain file
under `images/`).
Emoji shortcodes (`:smile:`) are intentionally unsupported — Unicode only.
Markdown image URLs are intentionally not fetched; journal attachments are rendered
from the encrypted archive.

The entries array is still read under the key `en` transitionally; 7.0 renames it
to `entries`, switched over once a real 7.0 file exists to test against. A full
format spec will live in a design doc in the repo root.

Write path: **New Entry** (⌘N / toolbar) composes an entry (date, mood, Markdown
content, image attachments) and re-encrypts the whole journal back to the
open file, in the same format the Electron app reads. Saving is verified by
round-trip tests; cross-app interop (Electron opening a SwiftUI-saved file) hasn't
been verified yet.

Not yet implemented: deleting entries, statistics.

`Core/` + `Models/Journal.swift` have no SwiftUI/AppKit dependencies, so the read
pipeline can be exercised headlessly by compiling them with a small `main.swift`
via `xcrun swiftc` — handy for verifying format compatibility without the GUI.
