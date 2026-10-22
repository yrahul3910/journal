import CryptoKit
import Foundation
import Testing
@testable import JournalBear

/// The 7.1 container against the known-answer vectors in
/// `test-vectors/journal-format-7.1.json`, which the Electron app checks too,
/// and against damaged and foreign files.
struct JournalContainerTests {
    struct Vector: Decodable, Sendable, CustomTestStringConvertible {
        let name: String
        let password: String
        let kdfSalt: String
        let payloadNonce: String
        let payloadLength: Int
        let fileKey: String
        let payloadKey: String
        let headerHex: String
        let fileSha256: String
        let fileHex: String?

        var testDescription: String { name }
    }

    static let password = "correct horse battery staple"
    static let headerLength = 77
    static let sealedChunkLength = 65536 + 16

    static func vectors() throws -> [Vector] {
        struct VectorFile: Decodable {
            let vectors: [Vector]
        }

        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("test-vectors/journal-format-7.1.json")
        return try JSONDecoder().decode(VectorFile.self, from: Data(contentsOf: url)).vectors
    }

    static func vector(named name: String) throws -> Vector {
        try #require(try vectors().first { $0.name == name })
    }

    static func bytes(hex: String) throws -> Data {
        let digits = Array(hex.utf8)

        return Data(try stride(from: 0, to: digits.count, by: 2).map { offset in
            try #require(UInt8(String(decoding: digits[offset..<offset + 2], as: UTF8.self), radix: 16))
        })
    }

    /// Payload byte `i` is `i mod 251`, as in the known-answer vectors.
    static func payload(_ length: Int) -> Data {
        Data((0..<length).map { UInt8($0 % 251) })
    }

    static func sha256(_ data: Data) -> Data {
        Data(SHA256.hash(data: data))
    }

    static func changed(_ file: Data, at offset: Int, to value: UInt8) -> Data {
        var copy = file
        copy[offset] = value
        return copy
    }

    static func flipped(_ file: Data, at offset: Int) -> Data {
        changed(file, at: offset, to: file[offset] ^ 1)
    }

    /// Seals one chunk the way the spec describes, independently of
    /// `JournalContainer`.
    static func sealedChunk(_ plaintext: Data, key: SymmetricKey, index: UInt8, isLast: Bool) throws -> Data {
        let nonce = try AES.GCM.Nonce(data: [UInt8](repeating: 0, count: 10) + [index, isLast ? 1 : 0])
        let box = try AES.GCM.seal(plaintext, using: key, nonce: nonce)
        return box.ciphertext + box.tag
    }

    // MARK: - Known answers

    @Test(arguments: try vectors())
    func reproducesTheKnownAnswers(_ vector: Vector) throws {
        let salt = try Self.bytes(hex: vector.kdfSalt)
        let payloadNonce = try Self.bytes(hex: vector.payloadNonce)
        let settings = JournalContainer.ScryptSettings(log2N: 17, r: 8, p: 1, salt: salt)
        let fileKey = try JournalContainer.deriveFileKey(password: vector.password, settings: settings)
        let payloadKey = JournalContainer.payloadKey(fileKey: fileKey, payloadNonce: payloadNonce)
        let expectedFileKey = try Self.bytes(hex: vector.fileKey)
        let expectedPayloadKey = try Self.bytes(hex: vector.payloadKey)

        #expect(fileKey.withUnsafeBytes { Data($0) } == expectedFileKey)
        #expect(payloadKey.withUnsafeBytes { Data($0) } == expectedPayloadKey)

        let plaintext = Self.payload(vector.payloadLength)
        let file = try JournalContainer.seal(
            plaintext,
            password: vector.password,
            salt: salt,
            payloadNonce: payloadNonce
        )
        let expectedHeader = try Self.bytes(hex: vector.headerHex)
        let expectedHash = try Self.bytes(hex: vector.fileSha256)

        #expect(file.prefix(Self.headerLength) == expectedHeader)
        #expect(Self.sha256(file) == expectedHash)
        if let fileHex = vector.fileHex {
            let expectedFile = try Self.bytes(hex: fileHex)
            #expect(file == expectedFile)
        }
        #expect(try JournalContainer.open(file, password: vector.password) == plaintext)
    }

    /// The vector spells its password decomposed (`e` plus a combining acute
    /// accent); both spellings must derive the same key.
    @Test(arguments: ["cafe\u{301} au lait", "caf\u{E9} au lait"])
    func derivesTheSameKeyFromEitherUnicodeForm(_ password: String) throws {
        let vector = try Self.vector(named: "password needing NFC normalization")
        let file = try JournalContainer.seal(
            Self.payload(vector.payloadLength),
            password: password,
            salt: try Self.bytes(hex: vector.kdfSalt),
            payloadNonce: try Self.bytes(hex: vector.payloadNonce)
        )
        let expectedHash = try Self.bytes(hex: vector.fileSha256)

        #expect(Self.sha256(file) == expectedHash)
    }

    // MARK: - Damaged and foreign files

    /// Three chunks: two full ones and a one-byte last chunk.
    static func threeChunkJournal() throws -> Data {
        try JournalContainer.seal(payload(2 * 65536 + 1), password: password)
    }

    @Test func refusesSettingsItDoesNotSupportBeforeRunningScrypt() throws {
        let file = try Self.threeChunkJournal()

        for (offset, value) in [(8, 2), (9, 2), (10, 16), (10, 20), (11, 1), (12, 2)] as [(Int, UInt8)] {
            #expect(throws: JournalError.newerVersion) {
                try JournalContainer.open(Self.changed(file, at: offset, to: value), password: Self.password)
            }
        }
    }

    @Test func readsAWrongPasswordOrADamagedHeaderAsAWrongPassword() throws {
        let file = try Self.threeChunkJournal()
        // kdfSalt, payloadNonce, and headerMac, and then scrypt settings this
        // reader supports but the file was not sealed with.
        let damagedHeaders = [20, 35, 50].map { Self.flipped(file, at: $0) } + [Self.changed(file, at: 10, to: 18)]

        #expect(throws: JournalError.wrongPassword) {
            try JournalContainer.open(file, password: "wrong horse")
        }
        for damaged in damagedHeaders {
            #expect(throws: JournalError.wrongPassword) {
                try JournalContainer.open(damaged, password: Self.password)
            }
        }
    }

    @Test func reportsDamageToThePayloadTruncationExtensionAndReordering() throws {
        let file = try Self.threeChunkJournal()
        let firstChunkEnd = Self.headerLength + Self.sealedChunkLength
        let secondChunkEnd = firstChunkEnd + Self.sealedChunkLength
        let swapped = file.prefix(Self.headerLength)
            + file[firstChunkEnd..<secondChunkEnd]
            + file[Self.headerLength..<firstChunkEnd]
            + file[secondChunkEnd...]
        let damagedFiles = [
            Self.flipped(file, at: 100),
            Self.flipped(file, at: file.count - 1),
            file.prefix(firstChunkEnd),
            file.prefix(secondChunkEnd),
            file.prefix(firstChunkEnd + 5),
            file + file[secondChunkEnd...],
            swapped,
            file.prefix(80),
        ]

        for damaged in damagedFiles {
            #expect(throws: JournalError.damaged) {
                try JournalContainer.open(damaged, password: Self.password)
            }
        }
    }

    @Test func refusesAnEmptyLastChunkAfterTheFirst() throws {
        let vector = try Self.vector(named: "exactly one chunk")
        let key = SymmetricKey(data: try Self.bytes(hex: vector.payloadKey))
        let header = try Self.bytes(hex: vector.headerHex)
        let chunk = Self.payload(vector.payloadLength)
        let expectedHash = try Self.bytes(hex: vector.fileSha256)
        let valid = try header + Self.sealedChunk(chunk, key: key, index: 0, isLast: true)
        let withEmptyLast = try header
            + Self.sealedChunk(chunk, key: key, index: 0, isLast: false)
            + Self.sealedChunk(Data(), key: key, index: 1, isLast: true)

        // The same construction without the empty chunk is the vector itself.
        #expect(Self.sha256(valid) == expectedHash)
        #expect(throws: JournalError.damaged) {
            try JournalContainer.open(withEmptyLast, password: vector.password)
        }
    }
}
