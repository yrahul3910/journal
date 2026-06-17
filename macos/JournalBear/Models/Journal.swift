import Foundation

/// Top-level decoded journal document. Mirrors the `.zjournal` `data.json` schema.
/// The `en` key is a historical name kept for backwards compatibility with old files.
struct JournalData: Decodable {
    var version: Double?
    var en: [JournalEntry]
}

/// A single journal entry.
///
/// Decoding is deliberately lenient: across the file format's history `entryDate`
/// has been stored as both a string and a number, and `attachment` as a string, an
/// array of strings, or omitted entirely. We tolerate all of these so old files open.
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

        if let arr = try? c.decode([String].self, forKey: .attachment) {
            attachment = arr
        } else if let s = try? c.decode(String.self, forKey: .attachment) {
            attachment = [s]
        } else {
            attachment = []
        }

        nsfw = (try? c.decode(Bool.self, forKey: .nsfw)) ?? false
    }
}

extension JournalEntry {
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
