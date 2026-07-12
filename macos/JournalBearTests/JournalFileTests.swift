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
        #expect(data.entries.count == 2)
    }

    @Test func resolvesImageAttachmentsAsValidJPEGs() throws {
        let data = try Self.openFixture()

        // JournalFile.open returns file order; find the entry with attachments
        // rather than assuming an index.
        let withImages = try #require(data.entries.first { !$0.images.isEmpty })
        #expect(withImages.images.count == 2)

        for image in withImages.images {
            #expect(!image.isEmpty)
            #expect(image.prefix(3).elementsEqual([0xFF, 0xD8, 0xFF])) // JPEG SOI marker
        }
    }

    @Test func entryWithoutAttachmentsHasNoImages() throws {
        let data = try Self.openFixture()
        #expect(data.entries.contains { $0.images.isEmpty })
    }

    @Test func wrongPasswordThrows() throws {
        let url = Self.fixtureURL
        try #require(FileManager.default.fileExists(atPath: url.path))
        #expect(throws: JournalError.self) {
            _ = try JournalFile.open(url: url, password: "definitely-the-wrong-password")
        }
    }

    // MARK: - Write path (round-trip)

    private static func tempURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("jb-roundtrip-\(UUID().uuidString).zjournal")
    }

    @Test func savesAndReopensANewEntry() throws {
        let original = try Self.openFixture()
        var entries = original.entries
        entries.append(JournalEntry(
            entryDate: "2030-01-02T03:04:05Z",
            content: "Round-trip test entry",
            sentiment: "Happy"
        ))

        let out = Self.tempURL()
        defer { try? FileManager.default.removeItem(at: out) }

        try JournalFile.save(entries, to: out, password: "round-trip-pw")
        let reopened = try JournalFile.open(url: out, password: "round-trip-pw")

        #expect(reopened.entries.count == original.entries.count + 1)
        #expect(reopened.entries.contains { $0.content == "Round-trip test entry" })
    }

    @Test func imageAttachmentsSurviveASaveRoundTrip() throws {
        let original = try Self.openFixture()
        let withImages = try #require(original.entries.first { !$0.images.isEmpty })

        let out = Self.tempURL()
        defer { try? FileManager.default.removeItem(at: out) }

        try JournalFile.save([withImages], to: out, password: "pw")
        let reopened = try JournalFile.open(url: out, password: "pw")

        let entry = try #require(reopened.entries.first)
        #expect(entry.images.count == withImages.images.count)
        #expect(entry.images.first?.prefix(3).elementsEqual([0xFF, 0xD8, 0xFF]) == true)
    }

    // MARK: - Date parsing

    /// The timezone-less ISO datetime an older Electron build wrote. This used to
    /// fail parsing, so the entry showed its raw string and sorted to distantPast.
    @Test func parsesTimezonelessISODatetime() throws {
        let date = try #require(JournalEntry.parseDate("2017-09-16T00:00:00"))
        let cal = Calendar(identifier: .gregorian)
        let c = cal.dateComponents([.year, .month, .day], from: date)
        #expect(c.year == 2017 && c.month == 9 && c.day == 16)
    }

    @Test func parsesDateOnly() throws {
        let date = try #require(JournalEntry.parseDate("2017-09-16"))
        let c = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: date)
        #expect(c.year == 2017 && c.month == 9 && c.day == 16)
    }

    @Test func parsesISOWithTimezoneAndEpoch() throws {
        #expect(JournalEntry.parseDate("2015-03-02T05:00:00.000Z") != nil)
        #expect(JournalEntry.parseDate("2015-03-02T05:00:00Z") != nil)
        #expect(JournalEntry.parseDate("1600000000000") != nil) // epoch ms
        #expect(JournalEntry.parseDate("1600000000") != nil)    // epoch s
    }

    @Test func rejectsGarbageDates() {
        #expect(JournalEntry.parseDate("") == nil)
        #expect(JournalEntry.parseDate("not a date") == nil)
    }

    // MARK: - Search

    @Test func searchesEntryContentAsCaseInsensitivePlainText() {
        let entries = [
            JournalEntry(entryDate: "2020-01-01", content: "A Happy memory", sentiment: "Happy"),
            JournalEntry(entryDate: "2020-01-02", content: "Literal [brackets]", sentiment: "Neutral"),
        ]

        #expect(EntrySearchCriteria(text: "happy").filter(entries).map(\.content) == ["A Happy memory"])
        #expect(EntrySearchCriteria(text: "[brackets]").filter(entries).map(\.content) == ["Literal [brackets]"])
    }

    @Test func filtersSearchResultsByMoodAndAttachments() {
        let entries = [
            JournalEntry(
                entryDate: "2020-01-01",
                content: "Trip with photos",
                sentiment: "Happy",
                attachments: ["photo.jpg"]
            ),
            JournalEntry(entryDate: "2020-01-02", content: "Quiet trip", sentiment: "Neutral"),
            JournalEntry(entryDate: "2020-01-03", content: "Ordinary day", sentiment: "Happy"),
        ]
        let criteria = EntrySearchCriteria(
            text: "trip",
            sentiment: "Happy",
            hasAttachments: true
        )

        #expect(criteria.filter(entries).map(\.content) == ["Trip with photos"])
    }

    @Test func emptySearchCriteriaReturnsAllEntries() {
        let entries = [
            JournalEntry(entryDate: "2020-01-01", content: "One", sentiment: "Happy"),
            JournalEntry(entryDate: "2020-01-02", content: "Two", sentiment: "Sad"),
        ]

        #expect(EntrySearchCriteria().filter(entries).count == 2)
        #expect(EntrySearchCriteria().isActive == false)
    }

    // MARK: - Store: staging vs. saving

    @MainActor
    @Test func addingEntryStagesInMemoryAndMarksDirty() {
        let store = JournalStore()
        #expect(store.hasUnsavedChanges == false)

        store.addEntry(JournalEntry(
            entryDate: "2020-01-01T00:00:00Z",
            content: "hi",
            sentiment: "Neutral"
        ))

        #expect(store.entries.count == 1)
        #expect(store.hasUnsavedChanges == true)
    }

    @MainActor
    @Test func savingWithNoOpenJournalIsANoOp() {
        let store = JournalStore()
        store.addEntry(JournalEntry(entryDate: "2020-01-01", content: "x", sentiment: "Neutral"))
        // No file/password behind the store, so save can't clear the dirty flag.
        store.save()
        #expect(store.hasUnsavedChanges == true)
    }

    @Test func savedFileFailsWithWrongPassword() throws {
        let entries = [JournalEntry(entryDate: "2030-01-01T00:00:00Z", content: "x", sentiment: "Neutral")]
        let out = Self.tempURL()
        defer { try? FileManager.default.removeItem(at: out) }

        try JournalFile.save(entries, to: out, password: "correct-horse")
        #expect(throws: JournalError.self) {
            _ = try JournalFile.open(url: out, password: "wrong-horse")
        }
    }
}
