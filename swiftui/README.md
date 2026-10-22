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

### Signing the Mac build with a team
The ad-hoc signature above never expires, so a Developer Program membership
isn't needed to keep local Mac builds working — the 7-day-vs-a-year distinction
is an iOS *provisioning profile* thing (see [PUBLISHING.md](PUBLISHING.md)).
What a team buys on macOS is a **stable code identity**: an ad-hoc signature
gets a new hash every build, so macOS treats each build as a different app and
resets its TCC permission grants (Files & Folders, Full Disk Access) along with
any keychain items. Signing with the team's Apple Development certificate keeps
them across rebuilds.

The project pins the team for iOS device builds only
(`DEVELOPMENT_TEAM[sdk=iphoneos*]`), so macOS stays team-less unless asked. In
Xcode, set Team on the macOS destination under Signing & Capabilities. From the
command line, drop `CODE_SIGNING_ALLOWED=NO` and the separate `codesign` step:
```sh
DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer" \
  xcodebuild -project JournalBear.xcodeproj -scheme JournalBear \
  -configuration Debug ONLY_ACTIVE_ARCH=YES \
  DEVELOPMENT_TEAM=7CMVH392CF CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates SYMROOT="$PWD/build" build
open "build/Debug/JournalBear for Mac.app"
```
Apple Development certificates last a year; renew under Xcode → Settings →
Accounts → Manage Certificates. For a build to keep around or hand to someone
else, use the notarized Developer ID flow in [PUBLISHING.md](PUBLISHING.md) —
that signature is timestamped and stays valid past the certificate's expiry.

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
Those overrides keep the test run ad-hoc signed on purpose, even when a team is
available — nothing here needs a real identity, and skipping profile resolution
is faster.
Tests that read a journal open the committed fixture `JournalBearTests/Fixtures/test_journal.zjournal` (password `$Password123`, embedded in the tests). It holds three entries: one with two generated JPEGs, one with no attachments, and one with the ten-second `Fixtures/clip.mp4`. All of its media is synthetic, so it is safe to keep in the repository and run in CI. `Fixtures/test_journal_7.1.zjournal` is the same journal written by the Electron app as format 7.1, and the container tests check this app's output byte for byte against the vectors in `../test-vectors/journal-format-7.1.json`, which the Electron tests check too. `launchClean()` also blanks the saved sidebar layout for each UI test launch, so a sidebar collapsed in everyday use doesn't hide the entry list.

## Layout
- `JournalBear/JournalBearApp.swift` — app entry, menu commands.
- `JournalBear/ContentView.swift` — split-view UI, entry list/detail, password sheet.
- `JournalBear/JournalStore.swift` — observable state; open/decrypt flow.
- `JournalBear/Models/Journal.swift` — `JournalData` / `JournalEntry` (lenient decoding).
- `JournalBear/Core/` — the `.zjournal` read pipeline:
  - `JournalContainer.swift`: the format 7.1 container: scrypt (libsodium, through swift-sodium), then HKDF, HMAC, and AES-256-GCM in 64 KiB chunks (CryptoKit).
  - `Crypto.swift`: the legacy 7.0 cipher, PBKDF2-HMAC-SHA256 (100k rounds) + AES-256-CBC (CommonCrypto), kept so older journals still open.
  - `Gzip.swift` — gzip header strip + raw DEFLATE inflate (Compression framework).
  - `Tar.swift` — minimal USTAR reader.
  - `JournalFile.swift` — orchestrates decrypt → gunzip → untar → parse `data.json`.

## File format
Journals are saved as format 7.1, specified in `journal-format-7.1.md` at the repository root: a 77-byte header (the magic `JBEARENC`, scrypt settings, salt, payload nonce, and a header MAC) followed by the payload sealed with AES-256-GCM in 64 KiB chunks. The payload is a gzip-compressed tar of `data.json` plus an `images/` directory. Journals written before 7.1 are `[16-byte salt][16-byte IV][AES-256-CBC ciphertext]` over the same payload; they still open, and saving rewrites them as 7.1. Both layouts match the Electron app's `src/main/container.ts`, `encryption.ts`, and `archive.ts`.

`images/` holds every attachment as a plain file, videos included, and each entry's `attachments` lists their paths. The file extension tells the kinds apart: `.mp4` and `.mov` are videos and everything else is an image. The Electron and SwiftUI apps write videos as `.mp4`; MOV is the same container family, and Chromium and AVFoundation both play it under that name.

## Status
Reads 7.0 and 7.1 journals and writes 7.1; the older 5.1 format is not supported. Read path: opens and decrypts a `.zjournal`, lists entries, renders structured Markdown entry content with Textual, renders image attachments inline, and plays video attachments inline (paused until played) from memory, without writing decrypted video to disk. Emoji shortcodes (`:smile:`) are intentionally unsupported; use Unicode emoji. Markdown image URLs are intentionally not fetched; journal attachments are rendered from the encrypted archive.

The entries array is still read under the key `en` transitionally; 7.0 renames it
to `entries`, switched over once a real 7.0 file exists to test against.

Write path: **New Entry** (⌘N / toolbar) composes an entry (date, mood, Markdown content, image and video attachments) and re-encrypts the whole journal back to the open file as format 7.1, which the Electron app reads. Every save is decrypted again before it replaces the file, so a save that would not reopen leaves the previous file in place.

Not yet implemented: deleting entries, statistics.

`Core/` + `Models/Journal.swift` have no SwiftUI/AppKit dependencies, so the read
pipeline can be exercised headlessly by compiling them with a small `main.swift`
via `xcrun swiftc` — handy for verifying format compatibility without the GUI.
