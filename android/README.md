# JournalBear for Android

Native Kotlin and Jetpack Compose app. Targets Android 16 (API 36), supports Android 8.0 (API 26) and newer, and reads and writes only journal format 7.0.

Open this directory in Android Studio, allow Gradle to sync, choose a device, and run the `app` configuration.

## Toolchain

- Android Studio with its bundled JDK. The Gradle daemon configuration pins Java 25; app bytecode targets Java 17.
- Android SDK Platform 37 for compilation, Build-Tools 36.0.0, and Platform-Tools.
- An Android 16 emulator or physical device for UI tests.
- Gradle 9.7.1 through the checked-in wrapper, Android Gradle Plugin 9.4.0, Kotlin Compose/serialization plugins 2.3.20.

Compile SDK 37 is required by the Compose dependencies. `targetSdk` remains 36, and `minSdk` remains 26. These settings have separate purposes.

For terminal builds on macOS:

```sh
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
cd android
./gradlew spotlessApply
./gradlew spotlessCheck :app:lint :app:test :app:assembleDebug :app:assembleRelease
./gradlew :app:connectedDebugAndroidTest
```

The last command needs a running emulator or connected device. Debug APK: `app/build/outputs/apk/debug/app-debug.apk`. The release APK is unsigned until a release signing configuration is supplied.

## First build

- Create a journal with a password and choose its location using Android's document picker.
- Open an existing 7.0 `.zjournal` and enter its password.
- Search entry content, dates, and moods; read Markdown and attached images.
- Add an entry with a date, mood, text, and photos from the system photo picker. PNG/JPEG files are preserved; other supported formats are converted to JPEG at 90% quality, sampled to at most 4096 pixels per side.
- Tap **Save entry** to encrypt and write the journal. **Save as** saves the journal, including a nonempty draft, to a new location and makes that file the open journal. Subsequent saves update that file.
- **Close journal** clears the open journal and password from app state.

New journal passwords require at least eight characters and confirmation. Existing journals accept their original password without a new length requirement. Passwords and plaintext journal data are never intentionally written to app storage or Android saved-instance state. A draft survives activity recreation, such as rotation, but an unsaved draft does not survive process termination. Save the entry before leaving the app.

If a provider write fails or is interrupted, a complete encrypted replacement remains in the app's private no-backup directory. Retry the save, use **Save as**, or reopen the app and choose **Recover journal** with the same password. Recovery data is removed after a successful, verified write. Clearing app data or uninstalling removes this private recovery copy.

If a recovery copy cannot be unlocked, **Discard recovery copy** offers a confirmation before permanently removing it. This restores the normal Open/Create actions and does not remove saved journal files.

The app requests neither internet nor broad storage permissions. It uses the document and photo picker grants. Markdown image URLs are not downloaded; only archive attachments are displayed. Screenshots and recent-app previews are protected by Android's secure-window flag.

This first build does not include editing/deleting existing entries, statistics, biometric unlock, or automatic reopening after process termination.

## File format and limits

The codec follows `../swiftui/JournalBear/Core/JournalFile.swift` and `Crypto.swift`:

```text
[16-byte salt][16-byte IV][AES-256-CBC ciphertext with PKCS padding]
key = PBKDF2-HMAC-SHA256(password, salt, 100000 rounds, 32 bytes)
plaintext = gzip(USTAR(data.json, images/...))
```

`data.json` must contain `version: 7` and `entries`. Each entry contains `entryDate`, `content`, `sentiment`, and `attachments`. Numeric epoch dates are also readable. Attachment references resolve by filename under `images/`. Missing images and invalid archives fail visibly to avoid silently losing attachments on the next save. Legacy `en`, legacy encryption, and future format versions are rejected.

Supported limits: 64 MiB encrypted file and expanded archive, 4 MiB JSON, and 12 MiB per image. Files are decoded in memory; archives are never extracted to filesystem paths. The format's existing AES-CBC scheme is preserved for interoperability.

## Tests and layout

- `core/`: Android-independent codec, models, date parsing, and search.
- `JournalStorage.kt`: document-provider I/O and encrypted recovery.
- `JournalStore.kt`: one activity-scoped ViewModel owning the open journal, draft, and background operations.
- `ui/`: Material 3 screens and native picker integration.
- `src/test/`: unit tests for format validation, encryption, attachment preservation, size limits, dates, search, and a Swift-generated fixture.
- `src/androidTest/`: Compose and UI Automator tests for the real document/photo pickers, password handling, saving, searching, reopening, rotation, draft discard, and failed-write recovery.

The public fixture `src/test/resources/swift-v7.b64` was generated using the repository's Swift `JournalFile.encrypt`, with synthetic text and a one-pixel PNG. Its test password is `interop-\u00e9-\uD83D\uDC3B` (Kotlin escapes). The unit test writes `app/build/interop-android.zjournal` for independent verification with the Swift reader. No personal journals are test inputs.
