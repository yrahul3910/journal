import Foundation

/// Top-level decoded journal document (the archive's `data.json`).
/// `en` is the historical key for the entries array; it becomes `entries` in the
/// finalized 7.0 format, but the current test file still uses `en`, so we keep it.
struct JournalData: Decodable {
    var version: Double?
    var en: [JournalEntry]
}

/// A single journal entry.
///
/// `attachment` is a list of filenames stored under `images/` in the archive.
/// Decoding stays tolerant of `entryDate` being a string or epoch number and of a
/// missing `attachment`/`nsfw`, so one odd field never fails the whole load.
struct JournalEntry: Identifiable, Decodable {
    let id = UUID()
    var entryDate: String
    var content: String
    var sentiment: String
    var attachment: [String]
    var nsfw: Bool

    /// Decoded image bytes for `attachment`, resolved against the archive at open
    /// time. Not part of the JSON; populated by `JournalFile`.
    var images: [Data] = []

    private enum CodingKeys: String, CodingKey {
        case entryDate, content, sentiment, attachment, nsfw
    }

    init(
        entryDate: String,
        content: String,
        sentiment: String,
        attachment: [String] = [],
        nsfw: Bool = false,
        images: [Data] = []
    ) {
        self.entryDate = entryDate
        self.content = content
        self.sentiment = sentiment
        self.attachment = attachment
        self.nsfw = nsfw
        self.images = images
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)

        if let s = try? c.decode(String.self, forKey: .entryDate) {
            entryDate = s
        } else if let n = try? c.decode(Double.self, forKey: .entryDate) {
            entryDate = String(n)
        } else {
            entryDate = ""
        }

        content = (try? c.decode(String.self, forKey: .content)) ?? ""
        sentiment = (try? c.decode(String.self, forKey: .sentiment)) ?? "Neutral"

        attachment = (try? c.decode([String].self, forKey: .attachment)) ?? []

        nsfw = (try? c.decode(Bool.self, forKey: .nsfw)) ?? false
    }
}

extension JournalEntry {
    /// The mood options offered when composing an entry.
    static let sentiments = ["Happy", "Excited", "Loved", "Neutral", "Sad", "Angry"]

    /// Best-effort human-readable date. Falls back to the raw stored value when the
    /// format isn't recognized, so we never hide data from the user.
    var displayDate: String {
        guard let date = Self.parseDate(entryDate) else { return entryDate }
        return date.formatted(date: .abbreviated, time: .omitted)
    }

    /// Content rendered with inline Markdown. Whitespace/newlines are preserved.
    /// Full block Markdown (headings, lists) is deferred to a later milestone.
    var attributedContent: AttributedString {
        let options = AttributedString.MarkdownParsingOptions(
            interpretedSyntax: .inlineOnlyPreservingWhitespace
        )
        return (try? AttributedString(markdown: content, options: options))
            ?? AttributedString(content)
    }

    static func parseDate(_ raw: String) -> Date? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        // Numeric epoch (seconds or milliseconds).
        if let number = Double(trimmed) {
            let seconds = number > 10_000_000_000 ? number / 1000 : number
            return Date(timeIntervalSince1970: seconds)
        }

        let iso = ISO8601DateFormatter()
        if let date = iso.date(from: trimmed) { return date }
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso.date(from: trimmed) { return date }

        return nil
    }
}
