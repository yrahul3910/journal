# Journal format 7.1: authenticated encryption and a real header

Status: accepted after two rounds of adversarial review. Author: Claude, with Rahul Yedida. Date: 2026-10-21.

## Summary

Format 7.1 does two things. It marks journals that may contain video attachments, so apps that predate video refuse them instead of mangling them, and it replaces the encryption, which predates the idea that an attacker's graphics card is the threat model. The new container starts with a short plaintext header, derives keys from the password with scrypt, proves the password with a header MAC (message authentication code), and encrypts the unchanged gzipped tar in 64 KiB chunks with AES-256-GCM. Readers keep opening 7.0 and older files; writers produce only 7.1, so a journal upgrades the first time it is saved, and every save is reopened the way Open would, password and all, before it replaces the previous file.

A few terms recur. A KDF (key derivation function) turns a password into a key and is slow on purpose, so guessing passwords is expensive; scrypt is a memory-hard KDF, meaning each guess also needs a large block of RAM, which is what makes guessing on GPUs and custom chips expensive. An AEAD (authenticated encryption with associated data) is a cipher mode that both hides data and detects any change to it. AES-256-GCM is AES with a 256-bit key in Galois/Counter Mode, the most widely deployed AEAD. HKDF (HMAC-based key derivation, RFC 5869) cheaply derives several independent keys from one. OWASP is the Open Worldwide Application Security Project, whose Password Storage Cheat Sheet is the usual reference for KDF settings.

## Where we are

A journal file today is `salt (16 bytes) || IV (16 bytes) || AES-256-CBC(gzip(tar(data.json, images/)))`, where the IV is the initialization vector that CBC (cipher block chaining) mode needs. The key comes from PBKDF2-HMAC-SHA256 with 100,000 iterations. All three apps implement this independently: `src/main/encryption.ts` (Electron), `swiftui/JournalBear/Core/Crypto.swift` and `JournalFile.swift` (SwiftUI), and `android/.../core/JournalFile.kt` (Android). The format version, `7` or `5.1`, lives inside `data.json`, so an app learns which format it holds only after decrypting it.

Four things are wrong with that, in rough order of how much they matter:

1. **The password is cheap to guess.** A stolen journal is attacked offline, where the only defense is the cost of each guess. PBKDF2 at 100,000 iterations took 8 ms per guess on the Apple-silicon Mac this was written on, and OWASP now asks for at least 600,000 (39 ms here) or, preferably, a memory-hard function. PBKDF2 is pure computation, which GPUs run thousands of times in parallel.
2. **Nothing detects tampering or corruption.** CBC only provides secrecy. Flipping a ciphertext bit predictably flips decrypted bits, and a damaged file decrypts to garbage without complaint. The only integrity check is the PKCS#7 padding at the end, which a wrong key passes about once in 256 tries, so the user sees a gzip error instead of "wrong password".
3. **The format cannot describe itself.** There is nowhere to put a version, a magic number, or KDF settings, so raising the iteration count is itself a breaking change, and an old app opening a new file can only say "wrong password or corrupted file".
4. **Integrity and large files pull against each other.** Electron streams decryption (journals now pass 2 GiB), and the mobile apps hold whole journals in memory; Android caps journals at 64 MB for that reason. An authenticated replacement must not make either worse, and ideally lets the mobile apps stream later.

Video adds a reason of its own. An app from before video shows a video as a broken image and, if it saves, renames it to `.png` or `.jpg`, so the next app also treats it as an image. A version those apps cannot open turns silent damage into a refusal.

## Goals and non-goals

Goals:

- A wrong password is reported as a wrong password. A modified, truncated, or extended file is reported as damaged. Both happen every time, before any decrypted data is used.
- An offline guess costs scrypt at or above OWASP's recommendation, and the settings can be raised later without another format change.
- An app knows from the first bytes which container it holds and refuses versions or settings it does not support with a message saying so.
- Electron decrypts and verifies journals of any size in bounded memory; the format allows the mobile apps to do the same later.
- A save never replaces a readable journal with an unreadable one.
- Electron and SwiftUI read everything they read today and write only 7.1. Android can implement the format with stock Java crypto plus one well-known library.
- All implementations produce byte-identical files for the same inputs, pinned by shared known-answer tests.

Non-goals:

- Changing what is encrypted. The payload stays `gzip(tar(data.json, images/))`; `data.json` keeps its schema with `version` 7.1.
- Multiple passwords, key files, cheap password changes, or recovery. Each wants a key-wrapping layer this design leaves room for but does not build.
- Hiding sizes. A file's length still reveals roughly how much media it holds.
- Making SwiftUI or Android stream now. They decrypt in memory today, and only the format has to allow streaming.
- Protecting an open journal. Decrypted data lives in app memory or the per-process temp folder while open, as today.

## The end state

When this ships:

- A journal file starts with the ASCII bytes `JBEARENC`. A file that does not is legacy (5.1 or 7.0) and goes through today's CBC path, read-only.
- A 77-byte header follows, ending in a MAC over the rest of the header. A wrong password fails that MAC and says so; a damaged chunk fails its own tag and says the file is damaged.
- Saving in Electron or SwiftUI writes this container, with `data.json` `version` 7.1 stamped by the writer. Opening accepts container version 1 and `data.json` versions 7.0 and 7.1 (plus 5.1 in Electron, as today).
- Before a save replaces the old file, the app reopens the new one exactly as Open would, deriving the key from the header it wrote, and checks that it reproduces the archive it meant to write.
- Electron holds at most one 64 KiB chunk of unverified plaintext at a time and writes nothing that failed verification. Electron adds no dependency; SwiftUI adds libsodium.
- This document is the format specification the SwiftUI README has been promising "in the repo root".

## Proposed design

### File layout

Integers in the header are single bytes, so the header has no byte order to get wrong; the chunk counter below is big-endian.

| Offset | Size | Field | Meaning |
| --- | --- | --- | --- |
| 0 | 8 | `magic` | ASCII `JBEARENC`. |
| 8 | 1 | `containerVersion` | `1` for format 7.1. |
| 9 | 1 | `kdfId` | `1` = scrypt. No other values are defined. |
| 10 | 1 | `scryptLog2N` | scrypt cost parameter N, as its base-2 logarithm. Writers use 17. |
| 11 | 1 | `scryptR` | scrypt block size r. Writers use 8. |
| 12 | 1 | `scryptP` | scrypt parallelism p. Writers use 1. |
| 13 | 16 | `kdfSalt` | Random salt for scrypt. |
| 29 | 16 | `payloadNonce` | Random per-save value that selects the payload key. |
| 45 | 32 | `headerMac` | HMAC-SHA-256 under `headerKey` of bytes 0 to 44. |
| 77 | ... | chunks | The encrypted payload. |

Bytes 0 to 76 are the **header**. A legacy file starts with a random salt, so it begins with `JBEARENC` with probability 2^-64.

Before running scrypt, a reader checks what it can without a key. A file whose `containerVersion` is not 1, whose `kdfId` is not 1, or whose scrypt settings fall outside what this reader supports is refused with "this journal was made by a newer version of JournalBear". For container version 1 a reader supports `scryptLog2N` of 17 or 18, `scryptR` of 8, and `scryptP` of 1, which is 128 MiB or 256 MiB of memory. Because this check runs before the MAC can be verified, a damaged byte in those fields also reads as "newer version"; that is the price of refusing to run scrypt on unauthenticated settings, and damage there is rare. A file that starts with `JBEARENC` but is shorter than 93 bytes (the header plus one tag) is reported as damaged. The ceiling is not decoration: these values are read before anything is authenticated, so a crafted file could otherwise ask for gigabytes and get the app killed. The range is reader policy, not part of what is signed, so a later release can widen it; writers that raise their settings must only do so once readers that accept them have shipped.

### Key schedule

```
password   = UTF-8 bytes of the password after Unicode NFC normalization
fileKey    = scrypt(password, kdfSalt, N = 2^scryptLog2N, r = scryptR, p = scryptP, 32 bytes)
headerKey  = HKDF-SHA-256(input key = fileKey, salt = empty, info = "JournalBear 7.1 header", 32 bytes)
payloadKey = HKDF-SHA-256(input key = fileKey, salt = payloadNonce, info = "JournalBear 7.1 payload", 32 bytes)
headerMac  = HMAC-SHA-256(headerKey, header bytes 0 to 44)
```

This is age's header and payload derivation (age is the file encryption tool by Filippo Valsorda and Ben Cartwright-Cox), down to the empty-salt header key and the nonce-salted payload key, without age's key wrapping: in age, scrypt protects a random file key, while here the scrypt output is the file key, because a journal has exactly one password. NFC normalization matters because the same visible password can be typed as different code points (an accented letter as one character or as a letter plus a combining accent), and Swift compares strings by meaning while JavaScript compares code units. Normalizing before encoding makes every app derive the same key. Legacy files keep whatever bytes their app used.

A reader computes `fileKey`, then checks `headerMac`. A mismatch means the password is wrong, or, much less likely, the header itself is damaged; the app says "wrong password". After that, a failing chunk can only mean the payload is damaged or was modified.

**No key cache.** Every save picks a fresh `kdfSalt` and `payloadNonce` and runs scrypt. An earlier draft cached `fileKey` between saves to skip scrypt; it is gone, because the verified save below has to derive the key from the written header anyway, so a cache would save one of two scrypt runs while adding its own failure modes (a cached key out of step with the header settings, two journals linkable through a shared salt, and the main process holding the password).

### Chunks

The payload is split into 65,536-byte chunks; the last holds the remainder, 1 to 65,536 bytes, unless the payload is empty, in which case there is exactly one empty chunk. Each chunk is sealed separately:

```
nonce_i = uint88_big_endian(i) || (i is the last chunk ? 0x01 : 0x00)     // 12 bytes
chunk_i = AES-256-GCM(payloadKey, nonce_i, plaintext_i, associated data = empty) // len + 16-byte tag
```

This is the STREAM construction (Hoang, Reyhanitabar, Rogaway and Vizar, 2015) in age's form, with AES-256-GCM in place of ChaCha20-Poly1305. The counter stops reordering and duplication; the final-chunk flag stops truncation and extension at a chunk boundary; and the header needs no associated-data binding because `payloadKey` already depends on `payloadNonce`, and the header MAC covers everything else.

Readers follow these rules, which implementations get wrong when they are left implicit:

- Read one chunk ahead: a chunk is the last only if end of file follows it, and it must then verify with flag 1. Every other chunk must verify with flag 0.
- A chunk is 65,552 bytes except the last. A last chunk shorter than 16 bytes, or exactly 16 bytes (an empty chunk) anywhere but position 0, is damage.
- Verify a chunk's tag before passing any of its plaintext on. Node needs `authTagLength: 16` on the decipher, or it accepts shorter tags.
- End of file without a verified final chunk is damage.

AES-256-GCM rather than age's ChaCha20-Poly1305: GCM is built into all three platforms, while Electron's Node (BoringSSL inside Electron 43.1) does not offer `chacha20-poly1305`. GCM is also hardware-accelerated on every device these apps run on. With a fresh key per save and at most 2^88 chunks, none of GCM's limits are within reach.

### Verified save

A save is not finished until the new file opens. After encrypting, the app runs the new bytes through the same function Open uses: it parses the header it just wrote, derives `fileKey` from that header and the password with scrypt, checks the header MAC and every chunk tag, and hashes the decrypted plaintext with SHA-256, which must equal the hash taken of the archive as it was encrypted. Only then does the new file replace the old one. Deriving the key from the written header is the point: a header that does not describe the key that encrypted the file (the bug a new writer is most likely to ship) fails here, at the one moment it would otherwise destroy the user's only copy, instead of on the next open as a baffling "wrong password".

The mechanics differ by app. Electron writes `.<name>.saving` beside the journal, verifies it from disk, and renames it over the old file. SwiftUI builds the whole encrypted file in memory already, so it opens that `Data` through its read path and compares the result with the archive it encrypted before handing it to `Data.write(options: .atomic)` or to `fileExporter`; on iOS a security-scoped file does not grant access to create a sibling file, so a beside-the-file temp copy is not an option there anyway.

The cost is a second scrypt and a second pass over the file. Encrypting, decrypting, and hashing 64 KiB chunks together ran at about 500 MB/s in Electron on this Mac, so verification adds about 0.3 s of scrypt plus a few seconds of reading for a 2 GB journal.

### Versions

There are two version numbers and they do different jobs. `containerVersion` says how the file is encrypted and is what readers check first. `data.json` `version` says what the payload may contain; 7.1 means video may appear. A reader accepts a container it supports and then any `data.json` version it supports. The writer, not the user interface, sets `version` to 7.1: in Electron that is the save code in the main process, not the renderer's state, which today carries 7.0.

Video already exists in `version: 7` files written by the unreleased Electron and SwiftUI builds that added it. Those builds ship together with 7.1, so no released build writes video into a 7.0 file, and the protection the bump gives pre-video apps is real for every released file. Android's video work, now in progress within 7.0, should be released together with Android's 7.1 support for the same reason.

### What each app does

Electron, `src/main/container.ts`, called from `encryption.ts` and `save.ts`. `decryptFile` checks for the magic; with it, `openContainer` checks the header policy, runs Node's asynchronous `crypto.scrypt` (on libuv's thread pool, so the main process keeps serving video and IPC), checks the header MAC with `crypto.timingSafeEqual`, and only then returns an async generator that reads the rest of the file and yields each chunk's plaintext once its tag verifies. No output file is opened until the password has checked out. `maxmem` must be 257 MiB: Node refuses N=2^18, r=8 at exactly 256 MiB. Without the magic it runs today's CBC path. Saving derives the key, streams the archive through an encrypting generator into the `.saving` file, then runs the verified-save check. `decryptFile` returns which of three things went wrong (wrong password, damaged, or made by a newer version), and the decrypt IPC handler, which today turns every failure into "Wrong password or corrupted file", passes that through to the unlock dialog. Electron gains no dependency: scrypt, HKDF, HMAC, and AES-GCM are all Node built-ins.

SwiftUI, `Core/Crypto.swift` and `Core/JournalFile.swift`. Reading checks the magic and policy, derives `fileKey` with libsodium's `crypto_pwhash_scryptsalsa208sha256_ll` (through `swift-sodium`'s `Clibsodium` module; version 0.11.0 ships libsodium 1.0.22 with that function in both the macOS and iOS slices), and uses CryptoKit for HKDF, HMAC, and `AES.GCM`, all in memory as today. `JournalError` gains the same three outcomes. `Core/` stays free of SwiftUI and AppKit.

Android, later. `javax.crypto` provides `AES/GCM/NoPadding` and `HmacSHA256`; scrypt comes from Bouncy Castle (`org.bouncycastle:bcprov-jdk18on`, `SCrypt.generate`). Chunking is what lets Android lift its 64 MB cap: it can stream and verify a 7.1 file chunk by chunk, where a single tag over the whole file would have kept the cap. Its video work, in a separate session, stays within 7.0 for now.

### Dependencies

One, in SwiftUI: `swift-sodium`, Swift bindings to libsodium maintained by libsodium's author, used only for scrypt. Android will add Bouncy Castle. Neither CryptoKit nor `javax.crypto` offers any memory-hard KDF, so a library is unavoidable on those two; Electron's Node has scrypt natively.

## Alternatives considered

**Argon2id instead of scrypt.** Argon2id is OWASP's first recommendation and the more modern design, notably resistant to side channels and to trading memory for time. It loses here on Electron specifics. Node in Electron cannot run it (`crypto.argon2` throws "not supported" on BoringSSL), so Electron would need a JavaScript or WebAssembly implementation. The pure-TypeScript `@noble/hashes` took 951 ms at 64 MiB on this Mac, blocks the thread it runs on, and its README says its third-party audit excluded the Argon2 module. Native scrypt took 274 ms at 128 MiB and runs off the main thread. For the same wait, scrypt makes each guess hold several times more memory, and memory is the attacker's cost. scrypt is also what age uses for passwords, and the libraries chosen for SwiftUI and Android provide both functions, so they do not change. The `kdfId` byte leaves room for Argon2id in a later container version if Node gains it.

**Keep PBKDF2 at 600,000 or more iterations; add only the header and AEAD.** No dependency anywhere, and OWASP accepts it where FIPS-140 (the US government's crypto-module standard) compliance is required. But it is the one choice that does not make each guess need memory, so GPUs keep their thousandfold advantage, and the KDF is the whole security of a stolen journal with a human-chosen password. The SwiftUI library is the only real cost of doing better.

**libsodium everywhere: `crypto_pwhash` plus `crypto_secretstream_xchacha20poly1305`.** The strongest form of "do not build a construction": secretstream is a reviewed streaming AEAD with truncation and reordering protection built in. It loses because Electron would need libsodium compiled to WebAssembly for the bulk encryption that Node's native AES-GCM does at hardware speed, and Android would need native libraries per CPU architecture through a JNI (Java Native Interface) wrapper. The construction we avoid by using it is age's STREAM, about forty lines per platform, pinned by shared test vectors.

**One AES-256-GCM message over the whole payload.** About forty lines simpler per app, and Electron could live with it: Node can stream GCM decryption with the tag read from the end of the file, and Electron already decrypts to a temp file before extracting. It fails on the mobile apps. CryptoKit and Android's GCM need the whole ciphertext in memory to verify it, which keeps Android's 64 MB cap forever and would rule out streaming on iOS. A single GCM message is also limited to about 64 GiB, and chunks localize damage.

**Keep CBC and add an HMAC.** The smallest code change, but it swaps one primitive for two plus a hand-made composition, still needs chunking for streaming verification, and gains nothing over an AEAD every platform ships.

**Adopt the age format outright.** Users could then decrypt a journal with the `age` command-line tool, a real escape hatch. But age's payload cipher is ChaCha20-Poly1305, which Electron's Node lacks, and there is no maintained Swift or Kotlin age library. We take its design and keep our own bytes.

## Trade-offs

- **One new dependency now (SwiftUI), one later (Android).** Each is a supply-chain surface in an encryption app; both are long-lived and pinned to exact versions.
- **Opening costs about 0.3 s more** in Electron at the default 2^17 (scrypt at 128 MiB, off the main thread; 2^18 took about 0.7 s), likely similar in SwiftUI's native code. **Saving costs about twice that,** one scrypt to encrypt and one to verify.
- **128 MiB during key derivation.** Fine on desktops and current iPhones. On Android, Bouncy Castle allocates it on the Java heap; judged acceptable (decision 2).
- **Saves read the file twice** for the verified-save check, a few seconds for a 2 GB journal.
- **Custom framing.** STREAM is our code in three languages, mitigated by following age's layout exactly and by byte-exact test vectors.
- **Old apps cannot open new journals,** and say only "wrong password or corrupted file". That is the point of the bump, but the message cannot be improved retroactively.

## Migration

Nothing converts in the background. Opening a legacy journal works as today, and the first save writes 7.1 under the same password, verified before it replaces the original. The legacy file is not kept: a backup would preserve the old, weaker encryption next to the new file, which is exactly what this change exists to retire. Electron's 5.1 migration still runs on read.

## Verification

- **Known-answer tests** carry the cross-app guarantee. A committed `test-vectors/journal-format-7.1.json` gives fixed inputs (password, including one that needs NFC normalization; `kdfSalt`; `payloadNonce`; scrypt settings at the minimum `scryptLog2N` of 17; payloads of 0 bytes, 1 byte, exactly 64 KiB, and 64 KiB plus 1, where payload byte `i` is `i mod 251`) with the expected `fileKey`, `payloadKey`, `headerMac`, the SHA-256 of the full file, and the full file bytes for the two small payloads. Electron and SwiftUI test against them now, Android later. Matching full-file bytes is what proves each app reads what the others write.
- **Negative tests** in each app: wrong password reported as such; a flipped bit in each header field, in a chunk body, and in a tag; truncation at and between chunk boundaries; an appended chunk; swapped chunks; an empty chunk after position 0; unsupported container version, KDF id, and settings, each reported as made by a newer version.
- **Verified-save tests:** a file whose header claims settings that differ from the ones its key was derived with must fail verification; likewise a file with a corrupted chunk. Electron's save tests check that a failed save leaves the old file untouched.
- **Fixture:** the committed `swiftui/JournalBearTests/Fixtures/test_journal.zjournal` stays as the legacy fixture, so both apps keep proving they open 7.0 files; a 7.1 copy of the same journal joins it.
- **End to end:** the Electron script (a 475 MB and a 2 GB journal: create, save, reopen, play) reruns on 7.1, and the SwiftUI UI tests run unchanged.

## Rollout

Electron and SwiftUI ship reading and writing 7.1 together; Android follows. The only person this could strand is someone who opens a journal on Android and saves it from an updated desktop app before Android supports 7.1. Today that is narrow: Android refuses journals over 64 MB, which already rules out the author's main journal. If that ever widens, ship reading 7.1 everywhere one release before writing it.

## Decisions

1. **scrypt, not Argon2id,** for the reasons under "Alternatives considered".
2. **128 MiB is acceptable on Android,** so Bouncy Castle's Java implementation is fine there.
3. **`.zjournal` everywhere.** SwiftUI already registers it with macOS and iOS (`com.yrahul.journalbear.zjournal`) and Android already saves it; Electron switches its save default from `.journal` and still opens `.journal` files. The container identifies itself, so the extension no longer says anything about the format, and Electron's habit of guessing 5.1 from `.zjournal` goes away. (`.journal` was also the riskier name: systemd writes its logs as `.journal` files on Linux.)

`swift-sodium`'s build on iOS 26 and macOS 26 is settled during implementation; the review confirmed its shipped binary exports the scrypt function on both.

## Review log

An adversarial review of the first draft found the following; all are addressed above.

- The key cache stored no KDF settings, so a journal opened with non-default settings would be saved with a header that does not match its key and become unreadable. Fixed first by storing the settings, then by removing the cache altogether (second round, below).
- A tag failure on the first chunk could not distinguish a wrong password from damage. Added age's header MAC.
- Migration and rollout contradicted each other, and the first save was an unverified rewrite of the user's only copy. Added the verified save and reconciled the rollout.
- The case against a single GCM message rested on a false Electron premise. It now rests on the mobile apps and GCM's size limit.
- scrypt was dismissed unfairly, and the cited Argon2 audit did not cover Argon2. The comparison was redone, and scrypt is now the proposal.
- The KDF bounds were loose enough to ask for 1 GiB, and out-of-range values were called corrupt. They are now tight and reported as "made by a newer version".
- Reader rules for chunks (tag length, short and empty chunks, counter byte order) were implicit. They are now explicit.
- Passwords had no normalization rule. They are now NFC-normalized.
- Two version fields had no precedence. The container version is checked first, and the writer stamps 7.1.
- A new journal under the same password reused the old salt, and the cache was not cleared or zeroed. The cache is gone (second round, below).
- Factual errors: RFC 9106's 64 MiB setting uses four lanes; age uses empty associated data plus a header MAC; a shared fixture alone does not prove cross-app reading. All corrected.

A second review of the revision confirmed the platform claims (swift-sodium 0.11.0 exports the scrypt function on macOS and iOS; Node's `maxmem` needs headroom above 256 MiB; empty-salt HKDF agrees across platforms; the header-MAC logic separates wrong passwords from damage) and found:

- The verified save checked the new file with the key the writer had just used, so a header that did not describe that key would pass, and the next open would claim the right password was wrong. It now derives the key from the written header, as Open does.
- With that fix, the key cache saved one of two scrypt runs per save while keeping all its failure modes. Removed.
- SwiftUI cannot create a temp file beside a security-scoped file on iOS and already writes atomically, so it verifies in memory before writing.
- Video already appears in `version: 7` files from the unreleased builds; the doc now says they ship with 7.1, and that Android's video work should too.
- Smaller fixes: the exact `maxmem` (257 MiB), Electron's three-way error plumbing, "age's schedule" narrowed to its derivation without key wrapping, and the result for damaged policy bytes and truncated headers.
