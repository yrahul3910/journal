# JournalBear — native macOS

A native SwiftUI build of JournalBear, maintained alongside the cross-platform
Electron app. macOS only; uses native widgets and (on macOS 26+) Liquid Glass.

## Requirements
- Xcode 26+ and macOS 26+ (Liquid Glass + the macOS 26 SDK).

## Build & run
Open `JournalBear.xcodeproj` in Xcode and press Run (⌘R). With **Team = None**,
Xcode signs "to run locally" — no Apple Developer Program / $99 fee needed for
personal use.

From the command line:
```sh
DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer" \
  xcodebuild -project JournalBear.xcodeproj -target JournalBear \
  -configuration Debug ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO \
  SYMROOT="$PWD/build" build
# arm64 requires a signature to launch; ad-hoc sign the result:
codesign --force --deep -s - build/Debug/JournalBear.app
open build/Debug/JournalBear.app
```

The project uses Xcode 16+ filesystem-synchronized groups, so new files added
under `JournalBear/` (or `JournalBearTests/`) are picked up automatically — no
`project.pbxproj` edits.

## Tests
Swift Testing target `JournalBearTests` (hosted by the app). Run in Xcode with ⌘U,
or from the command line:
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
decrypts a `.zjournal`, lists entries, shows entry content (inline Markdown), and
renders image attachments inline (every image is a plain file under `images/`).
Emoji shortcodes (`:smile:`) are intentionally unsupported — Unicode only.

The entries array is still read under the key `en` transitionally; 7.0 renames it
to `entries`, switched over once a real 7.0 file exists to test against. A full
format spec will live in a design doc in the repo root.

Write path: **New Entry** (⌘N / toolbar) composes an entry (date, mood, Markdown
content, image attachments) and re-encrypts the whole journal back to the
open file, in the same format the Electron app reads. Saving is verified by
round-trip tests; cross-app interop (Electron opening a SwiftUI-saved file) hasn't
been verified yet.

Not yet implemented: editing/deleting entries, full block Markdown, search, statistics.

`Core/` + `Models/Journal.swift` have no SwiftUI/AppKit dependencies, so the read
pipeline can be exercised headlessly by compiling them with a small `main.swift`
via `xcrun swiftc` — handy for verifying format compatibility without the GUI.
