import Testing
import Foundation
@testable import JournalBear

/// Read-path regression tests against a real `.zjournal` file.
///
/// The fixture (`test_journal.zjournal`, password `$Password123`) lives at the repo
/// root and is gitignored, so we resolve it relative to this source file rather than
/// bundling it. Tests `#require` it exists and fail loudly if it's missing.
///
/// Once the write/encrypt path lands, these should be joined by round-trip tests that
/// build a `JournalData`, save it, reopen it, and assert equality — no binary fixture
/// or embedded password needed.
struct JournalFileTests {
    static let password = "$Password123"

    static var fixtureURL: URL {
        URL(fileURLWithPath: #filePath)        // macos/JournalBearTests/JournalFileTests.swift
            .deletingLastPathComponent()       // macos/JournalBearTests
            .deletingLastPathComponent()       // macos
            .deletingLastPathComponent()       // repo root
            .appendingPathComponent("test_journal.zjournal")
    }

    private static func openFixture(password: String = password) throws -> JournalData {
        let url = fixtureURL
        try #require(
            FileManager.default.fileExists(atPath: url.path),
            "Missing fixture: \(url.path)"
        )
        return try JournalFile.open(url: url, password: password)
    }

    @Test func opensAndDecodesAllEntries() throws {
        let data = try Self.openFixture()
        #expect(data.en.count == 2)
    }

    @Test func resolvesImageAttachmentsAsValidJPEGs() throws {
        let data = try Self.openFixture()

        // JournalFile.open returns file order; find the entry with attachments
        // rather than assuming an index.
        let withImages = try #require(data.en.first { !$0.images.isEmpty })
        #expect(withImages.images.count == 2)

        for image in withImages.images {
            #expect(!image.isEmpty)
            #expect(image.prefix(3).elementsEqual([0xFF, 0xD8, 0xFF])) // JPEG SOI marker
        }
    }

    @Test func entryWithoutAttachmentsHasNoImages() throws {
        let data = try Self.openFixture()
        #expect(data.en.contains { $0.images.isEmpty })
    }

    @Test func wrongPasswordThrows() throws {
        let url = Self.fixtureURL
        try #require(FileManager.default.fileExists(atPath: url.path))
        #expect(throws: JournalError.self) {
            _ = try JournalFile.open(url: url, password: "definitely-the-wrong-password")
        }
    }
}
