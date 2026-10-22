import Clibsodium
import CryptoKit
import Foundation

/// The encrypted container of journal format 7.1, specified in
/// `journal-format-7.1.md` at the repository root and shared byte for byte
/// with the Electron app's `src/main/container.ts`.
///
/// A 77-byte header (magic, container version, KDF id, scrypt settings, salt,
/// payload nonce, and an HMAC over all of those) is followed by the payload,
/// sealed with AES-256-GCM in 64 KiB chunks whose nonces carry the chunk
/// index and a last-chunk flag.
enum JournalContainer {
    struct ScryptSettings {
        let log2N: UInt8
        let r: UInt8
        let p: UInt8
        let salt: Data
    }

    private static let magic = Data("JBEARENC".utf8)
    private static let containerVersion: UInt8 = 1
    private static let kdfScrypt: UInt8 = 1
    private static let headerBodyLength = 45 // the header bytes the header MAC covers
    private static let headerLength = 77
    private static let tagLength = 16
    private static let chunkLength = 65536
    private static let sealedChunkLength = chunkLength + tagLength
    private static let keyLength = 32

    private static let isSodiumReady = sodium_init() >= 0

    static func isContainer(_ file: Data) -> Bool {
        file.starts(with: magic)
    }

    /// Encrypt `plaintext` as a 7.1 journal under `password`, with the
    /// writers' scrypt settings: N = 2^17, r = 8, p = 1, or 128 MiB.
    ///
    /// `salt` and `payloadNonce` default to fresh random bytes, as every save
    /// needs; tests fix them to compare against known answers.
    static func seal(
        _ plaintext: Data,
        password: String,
        salt: Data = randomBytes(16),
        payloadNonce: Data = randomBytes(16)
    ) throws -> Data {
        let settings = ScryptSettings(log2N: 17, r: 8, p: 1, salt: salt)
        let fileKey = try deriveFileKey(password: password, settings: settings)
        let key = payloadKey(fileKey: fileKey, payloadNonce: payloadNonce)

        var file = magic + [containerVersion, kdfScrypt, settings.log2N, settings.r, settings.p] + salt + payloadNonce
        file.append(contentsOf: HMAC<SHA256>.authenticationCode(for: file, using: headerKey(fileKey: fileKey)))
        file.reserveCapacity(headerLength + plaintext.count + (plaintext.count / chunkLength + 1) * tagLength)

        // A chunk is the last when it reaches the end of the plaintext; an
        // empty plaintext is one empty chunk.
        var start = plaintext.startIndex
        var index: UInt64 = 0

        repeat {
            let end = plaintext.index(start, offsetBy: chunkLength, limitedBy: plaintext.endIndex) ?? plaintext.endIndex
            let box = try AES.GCM.seal(
                plaintext[start..<end],
                using: key,
                nonce: chunkNonce(index: index, isLast: end == plaintext.endIndex)
            )
            file.append(box.ciphertext)
            file.append(box.tag)
            start = end
            index += 1
        } while start < plaintext.endIndex

        return file
    }

    /// Decrypt the 7.1 journal `file` with `password`.
    ///
    /// Throws `JournalError.newerVersion` for a container version, KDF, or
    /// scrypt settings this reader does not support, checked before scrypt
    /// runs; `.wrongPassword` when the header MAC fails; and `.damaged` for a
    /// file too short to hold a header and one tag, or a truncated, extended,
    /// reordered, or modified payload.
    static func open(_ file: Data, password: String) throws -> Data {
        guard file.count >= headerLength + tagLength else { throw JournalError.damaged }

        let header = Data(file.prefix(headerLength))
        let settings = try supportedSettings(header: header)
        let fileKey = try deriveFileKey(password: password, settings: settings)
        let isAuthentic = HMAC<SHA256>.isValidAuthenticationCode(
            header.suffix(from: headerBodyLength),
            authenticating: header.prefix(headerBodyLength),
            using: headerKey(fileKey: fileKey)
        )
        guard isAuthentic else { throw JournalError.wrongPassword }

        let key = payloadKey(fileKey: fileKey, payloadNonce: header.subdata(in: 29..<headerBodyLength))
        let payload = file.dropFirst(headerLength)
        var plaintext = Data(capacity: payload.count)
        var start = payload.startIndex
        var index: UInt64 = 0

        // A chunk is the last only if end of file follows it. The size check
        // above guarantees at least one.
        repeat {
            let end = min(start + sealedChunkLength, payload.endIndex)
            let sealed = payload[start..<end]
            let isLast = end == payload.endIndex

            // The last chunk needs at least a tag, and may be empty only when
            // it is the only chunk.
            if isLast, sealed.count < tagLength || (sealed.count == tagLength && index > 0) {
                throw JournalError.damaged
            }

            plaintext.append(try openChunk(sealed, key: key, index: index, isLast: isLast))
            start = end
            index += 1
        } while start < payload.endIndex

        return plaintext
    }

    /// The scrypt output for `password` under `settings`, from which the
    /// header and payload keys are derived.
    ///
    /// The password is normalized to NFC first, so every app turns the same
    /// visible password into the same bytes.
    static func deriveFileKey(password: String, settings: ScryptSettings) throws -> SymmetricKey {
        guard isSodiumReady else { throw JournalError.keyDerivationFailed }

        let passwordBytes = Array(password.precomposedStringWithCanonicalMapping.utf8)
        let salt = Array(settings.salt)
        var key = [UInt8](repeating: 0, count: keyLength)
        let status = crypto_pwhash_scryptsalsa208sha256_ll(
            passwordBytes, passwordBytes.count,
            salt, salt.count,
            UInt64(1) << settings.log2N, UInt32(settings.r), UInt32(settings.p),
            &key, keyLength
        )

        // With settings this reader accepts, scrypt fails only when it cannot
        // allocate its memory.
        guard status == 0 else { throw JournalError.keyDerivationFailed }
        return SymmetricKey(data: key)
    }

    static func payloadKey(fileKey: SymmetricKey, payloadNonce: Data) -> SymmetricKey {
        HKDF<SHA256>.deriveKey(
            inputKeyMaterial: fileKey,
            salt: payloadNonce,
            info: Data("JournalBear 7.1 payload".utf8),
            outputByteCount: keyLength
        )
    }

    /// Cryptographically secure random bytes: `SystemRandomNumberGenerator`
    /// is a CSPRNG on Apple platforms.
    static func randomBytes(_ count: Int) -> Data {
        var generator = SystemRandomNumberGenerator()
        return Data((0..<count).map { _ in UInt8.random(in: .min ... .max, using: &generator) })
    }

    private static func headerKey(fileKey: SymmetricKey) -> SymmetricKey {
        HKDF<SHA256>.deriveKey(
            inputKeyMaterial: fileKey,
            salt: Data(),
            info: Data("JournalBear 7.1 header".utf8),
            outputByteCount: keyLength
        )
    }

    /// The scrypt settings `header` claims, if this reader supports them.
    ///
    /// The header MAC can only be checked once scrypt has run with these
    /// settings, so they are read unauthenticated. Anything unsupported is
    /// refused before it can cost memory: a crafted file could otherwise ask
    /// for gigabytes.
    private static func supportedSettings(header: Data) throws -> ScryptSettings {
        let (version, kdfId, log2N, r, p) = (header[8], header[9], header[10], header[11], header[12])
        let isSupported = version == containerVersion
            && kdfId == kdfScrypt
            && (log2N == 17 || log2N == 18)
            && r == 8
            && p == 1
        guard isSupported else { throw JournalError.newerVersion }

        return ScryptSettings(log2N: log2N, r: r, p: p, salt: header.subdata(in: 13..<29))
    }

    /// An 11-byte big-endian chunk counter followed by the last-chunk flag.
    private static func chunkNonce(index: UInt64, isLast: Bool) throws -> AES.GCM.Nonce {
        var bytes = [UInt8](repeating: 0, count: 3)
        withUnsafeBytes(of: index.bigEndian) { bytes.append(contentsOf: $0) }
        bytes.append(isLast ? 1 : 0)

        return try AES.GCM.Nonce(data: bytes)
    }

    private static func openChunk(_ sealed: Data, key: SymmetricKey, index: UInt64, isLast: Bool) throws -> Data {
        do {
            let box = try AES.GCM.SealedBox(
                nonce: chunkNonce(index: index, isLast: isLast),
                ciphertext: sealed.dropLast(tagLength),
                tag: sealed.suffix(tagLength)
            )
            return try AES.GCM.open(box, using: key)
        } catch {
            throw JournalError.damaged
        }
    }
}
