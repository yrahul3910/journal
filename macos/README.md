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
under `JournalBear/` are picked up automatically — no `project.pbxproj` edits.

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
Open-only milestone: opens and decrypts a `.zjournal`, lists entries, shows
entry content (inline Markdown). Not yet implemented: image attachment display,
full block Markdown, creating/editing/saving, search, statistics.
