# Publishing JournalBear (iOS)

How to ship the native app to the App Store. All commands run from `swiftui/`.
For day-to-day building and testing, see [README.md](README.md).

## One-time setup (already done, recorded here for posterity)

- **Team**: the Apple Developer Program membership lives on team `7CMVH392CF`
  (the old Personal Team, upgraded in place). The project pins it for device
  builds via `DEVELOPMENT_TEAM[sdk=iphoneos*]`; macOS and simulator builds
  stay team-less ("Sign to Run Locally").
- **Certificates**: Apple Development, Apple Distribution, and Developer ID
  Application, all managed by Xcode (Settings → Accounts → Manage
  Certificates). If they're missing on a new machine, download them there.
- **Project config** (in `project.pbxproj` / `Info.plist`, no action needed
  per release):
  - `ITSAppUsesNonExemptEncryption = NO` — journals use standard AES-256 via
    CommonCrypto to protect the user's own data, which is exempt from export
    documentation. This skips the compliance questionnaire on every upload.
  - `TARGETED_DEVICE_FAMILY = 1` — iPhone-only, so no iPad screenshots are
    required. Revisit for a native iPad release.
  - The 1024pt app icon is PNG (`1024x1024.png`) — App Store validation
    rejects JPEG icons.
  - The `.zjournal` UTI is exported and registered for Files/Finder opens
    (see `Info.plist` at the repo `swiftui/` root, merged into the generated
    plist at build time).

## Every release

1. **Bump versions.** Each upload needs a unique build number: increment
   `CURRENT_PROJECT_VERSION` (both Debug and Release blocks of the app
   target). Bump `MARKETING_VERSION` when the user-facing version changes.
2. **Run the tests on both platforms:**
   ```sh
   xcodebuild test -project JournalBear.xcodeproj -scheme JournalBear \
     -destination 'platform=macOS'
   xcodebuild test -project JournalBear.xcodeproj -scheme JournalBear \
     -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
   ```
   (Quit any Xcode-debugged instance of the app first, or the first UI test
   fails with "Failed to terminate".)
3. **Archive:**
   ```sh
   xcodebuild -project JournalBear.xcodeproj -scheme JournalBear \
     -configuration Release -destination 'generic/platform=iOS' \
     -archivePath Build/JournalBear-iOS.xcarchive \
     -allowProvisioningUpdates archive
   ```
4. **Export the .ipa** (signed with Apple Distribution + App Store profile):
   ```sh
   xcodebuild -exportArchive \
     -archivePath Build/JournalBear-iOS.xcarchive \
     -exportPath Build/AppStoreExport \
     -exportOptionsPlist Scripts/exportOptions.plist \
     -allowProvisioningUpdates
   ```
5. **Upload.** Either open the archive in Xcode's Organizer (Window →
   Organizer → Distribute App → App Store Connect), or set `destination` to
   `upload` in `Scripts/exportOptions.plist` and rerun step 4.
6. **TestFlight & review.** The build appears in App Store Connect →
   TestFlight after ~15 minutes of processing. Internal testers get it
   immediately, with no install expiry. When submitting for review, note in
   the review notes that journals are created in-app (no demo file or login
   needed by the reviewer).

## Screenshots

Capture on the **iPhone 17 Pro Max** simulator — its native 1320×2868 is the
6.9-inch display size. Watch the device: the iPhone 17 **Pro** captures at
1206×2622, which App Store Connect rejects outright.

Depending on which slot App Store Connect shows, it may instead demand the
6.5-inch display sizes (1242×2688 or 1284×2778, plus landscape). Captures
can't be taken natively at those sizes on the iOS 26 simulators; resize
Pro Max or Pro captures instead (the sub-1% aspect change is invisible):

```sh
sips -z 2778 1284 shot.png --out screenshot.png
```

**1. Generate the demo journal** (fictional content, built through the app's
own encryption pipeline; the `.zjournal` is gitignored, regenerate at will):

```sh
xcrun swiftc Scripts/MakeDemoJournal.swift JournalBear/Core/*.swift \
  JournalBear/Models/Journal.swift -o /tmp/make_demo
/tmp/make_demo "../My Journal.zjournal"
```

The password is `$Password123` (also noted in the script header). The file
is named `My Journal.zjournal` because the list header shows the filename.

**2. Stage the simulator** with the journal auto-opened (Debug builds only —
the `JOURNALBEAR_UI_TEST_*` hooks are compiled out of Release):

```sh
xcodebuild -project JournalBear.xcodeproj -scheme JournalBear \
  -configuration Debug -destination 'generic/platform=iOS Simulator' build
xcrun simctl boot "iPhone 17 Pro Max"    # errors harmlessly if already booted
open -a Simulator
xcrun simctl install "iPhone 17 Pro Max" Build/Products/Debug-iphonesimulator/JournalBear.app
env "SIMCTL_CHILD_JOURNALBEAR_UI_TEST_JOURNAL=$HOME/projects/journal/My Journal.zjournal" \
  'SIMCTL_CHILD_JOURNALBEAR_UI_TEST_PASSWORD=$Password123' \
  xcrun simctl launch "iPhone 17 Pro Max" com.yrahul.JournalBear
```

**3. Clean status bar**, then capture with ⌘S in Simulator (saves to the
Desktop) or `xcrun simctl io "iPhone 17 Pro Max" screenshot out.png`:

```sh
xcrun simctl status_bar "iPhone 17 Pro Max" override --time "9:41" \
  --batteryLevel 100 --batteryState charged --cellularBars 4 --wifiBars 3
```

A good five-shot set: the entry list, the sourdough entry (Markdown table),
the Kyoto entry (lists), the compose sheet (＋ button), and the password
prompt (the privacy story). Existing shots live in `../screenshots/`.

## Store listing copy

**Subtitle** (30 chars max):

> Private, encrypted journaling

**Promotional text** (170 chars max, editable without a new review):

> Your journal, sealed in one encrypted file only you can open. Markdown
> entries, moods, photos, and search — fully offline, no account, no
> tracking.

**Keywords** (100 chars max, currently 95):

> diary,journal,encrypted,private,secure,markdown,mood,notes,offline,password,daily,writing,vault

**Description:**

> JournalBear is a private, encrypted journal that lives in a single file
> only you can open.
>
> Everything you write is sealed with AES-256 encryption, using a key
> derived from your password. There is no account, no cloud, and no
> tracking — your journal never leaves your device unless you move it
> yourself.
>
> WRITE FREELY
> • Entries are Markdown: headings, lists, quotes, tables, and code blocks
> render beautifully
> • Attach photos straight from your library
> • Tag every entry with a mood
>
> FIND ANYTHING
> • Search the full text of your journal
> • Filter entries by mood or attachments
>
> ONE PORTABLE FILE
> Your entire journal — entries, photos, everything — is a single encrypted
> .zjournal file. Keep it in Files, back it up anywhere, and open the same
> file with JournalBear on your desktop.
>
> PRIVATE BY DESIGN
> • AES-256 encryption, with the key derived from your password (PBKDF2)
> • No account, no analytics, no data collection
> • Works entirely offline — the app never touches the network
> • Your password is the only key: nobody, including us, can recover a
> forgotten one
>
> Your thoughts belong to you. JournalBear just keeps them safe.

Other App Store Connect fields: App Privacy is "Data Not Collected". The
URLs come from the static site in the repo's root `docs/` folder, served by
GitHub Pages (Settings → Pages → Deploy from branch → `master` / `/docs`):

- Privacy Policy URL: https://yrahul3910.github.io/journal/privacy.html
- Support URL: https://yrahul3910.github.io/journal/support.html
- Marketing URL (optional): https://yrahul3910.github.io/journal/

After the app is approved, swap the landing page's "Coming soon" button for
Apple's official App Store badge and the real store link.

## macOS distribution (later)

The Developer ID Application certificate enables notarized direct
distribution of the Mac app (archive → `xcrun notarytool submit` → staple),
matching how the Electron app ships. Hardened runtime is already enabled.
The Mac App Store would additionally require adopting App Sandbox — feasible
(all file access already goes through user-selected pickers with
security-scoped handling) but a separate work item.
