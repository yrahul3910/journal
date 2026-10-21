import Testing
import Foundation
import SwiftUI
@testable import JournalBear
@testable import Textual

/// Read-path regression tests against a real `.zjournal` file.
///
/// The committed fixture `Fixtures/test_journal.zjournal` (password `$Password123`)
/// holds three entries: June 16 with two JPEGs, June 15 with no attachments, and
/// June 14 with `Fixtures/clip.mp4`. Its media is synthetic, so it can live in the
/// repository and CI. Tests resolve it relative to this source file rather than
/// bundling it.
struct JournalFileTests {
    static let password = "$Password123"

    static var fixtureURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("Fixtures/test_journal.zjournal")
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
        #expect(data.entries.count == 3)
    }

    @Test func resolvesImageAttachmentsAsValidJPEGs() throws {
        let data = try Self.openFixture()

        // JournalFile.open returns file order; find the entry with attachments
        // rather than assuming an index.
        let withImages = try #require(data.entries.first { !$0.media.isEmpty })
        #expect(withImages.media.count == 2)

        for attachment in withImages.media {
            #expect(attachment.kind == .image)
            #expect(attachment.data.prefix(3).elementsEqual([0xFF, 0xD8, 0xFF])) // JPEG SOI marker
        }
    }

    @Test func entryWithoutAttachmentsHasNoImages() throws {
        let data = try Self.openFixture()
        #expect(data.entries.contains { $0.media.isEmpty })
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

    @Test func savesAndReopensStructuredMarkdownWithoutChangingSource() throws {
        let markdown = """
            # A Markdown heading

            A paragraph with **bold text**, `inline code`, and a [link](https://example.com).

            - First list item
            - Second list item

            > A block quote

            ```swift
            let rendered = true
            ```

            | Left | Right |
            | --- | --- |
            | one | two |

            ![An image](file:///private/journal-image.jpg)
            """
        let out = Self.tempURL()
        defer { try? FileManager.default.removeItem(at: out) }

        try JournalFile.save(
            [
                JournalEntry(
                    entryDate: "2030-01-02T03:04:05Z",
                    content: markdown,
                    sentiment: "Neutral"
                )
            ],
            to: out,
            password: "round-trip-pw"
        )
        let reopened = try JournalFile.open(url: out, password: "round-trip-pw")

        let entry = try #require(reopened.entries.first)
        #expect(entry.content == markdown)
    }

    @MainActor
    @Test func blocksRemoteAndLocalMarkdownImageURLs() async throws {
        let remoteURL = try #require(URL(string: "https://example.com/image.jpg"))
        let localURL = URL(fileURLWithPath: "/private/journal-image.jpg")
        let loader = DisabledMarkdownImageLoader()
        let environment = ColorEnvironmentValues(
            colorScheme: .light,
            colorSchemeContrast: .standard
        )

        for url in [remoteURL, localURL] {
            do {
                _ = try await loader.attachment(
                    for: url,
                    text: "",
                    environment: environment
                )
                Issue.record("The Markdown image loader accepted \(url.absoluteString)")
            } catch let error as URLError {
                #expect(error.code == .unsupportedURL)
            } catch {
                Issue.record("The Markdown image loader returned an unexpected error: \(error)")
            }
        }
    }

    @Test func imageAttachmentsSurviveASaveRoundTrip() throws {
        let original = try Self.openFixture()
        let withImages = try #require(original.entries.first { !$0.media.isEmpty })

        let out = Self.tempURL()
        defer { try? FileManager.default.removeItem(at: out) }

        try JournalFile.save([withImages], to: out, password: "pw")
        let reopened = try JournalFile.open(url: out, password: "pw")

        let entry = try #require(reopened.entries.first)
        #expect(entry.media.count == withImages.media.count)
        #expect(entry.media.first?.data.prefix(3).elementsEqual([0xFF, 0xD8, 0xFF]) == true)
    }

    // MARK: - Video attachments

    /// A ten-second 90x160 H.264 clip, committed next to these tests.
    static var clipURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("Fixtures/clip.mp4")
    }

    @Test func videoAttachmentsSurviveASaveRoundTripAsMP4() throws {
        let clip = try Data(contentsOf: Self.clipURL)
        let png = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        let out = Self.tempURL()
        defer { try? FileManager.default.removeItem(at: out) }

        try JournalFile.save(
            [
                JournalEntry(
                    entryDate: "2030-01-02T03:04:05Z",
                    content: "A video day",
                    sentiment: "Happy",
                    media: [MediaAttachment(kind: .image, data: png), MediaAttachment(kind: .video, data: clip)]
                )
            ],
            to: out,
            password: "round-trip-pw"
        )
        let entry = try #require(try JournalFile.open(url: out, password: "round-trip-pw").entries.first)

        #expect(entry.media.map(\.kind) == [.image, .video])
        #expect(entry.media.last?.data == clip)
        #expect(entry.attachments.map { URL(fileURLWithPath: $0).pathExtension } == ["png", "mp4"])
    }

    @Test func classifiesAttachmentsByFileExtension() {
        #expect(MediaAttachment(data: Data(), filename: "clip.mp4").kind == .video)
        #expect(MediaAttachment(data: Data(), filename: "IMG_0001.MOV").kind == .video)
        #expect(MediaAttachment(data: Data(), filename: "photo.jpg").kind == .image)
        #expect(MediaAttachment(data: Data(), filename: "untitled").kind == .image)
    }

    /// Playback reads the decrypted bytes through a resource loader, never a
    /// temporary file. A slice checks that byte ranges are taken relative to
    /// the data's own start index.
    @Test func playsVideoBytesFromMemory() async throws {
        let attachment = try #require(Self.openFixture().entries.flatMap(\.media).first { $0.kind == .video })
        let video = InMemoryVideo(data: (Data(repeating: 0, count: 3) + attachment.data).dropFirst(3))

        let (isPlayable, duration) = try await video.asset.load(.isPlayable, .duration)
        #expect(isPlayable)
        #expect(abs(duration.seconds - 10) < 0.1)

        let aspectRatio = try #require(await video.displayAspectRatio())
        #expect(abs(aspectRatio - 90.0 / 160.0) < 0.01)
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
