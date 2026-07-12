import Foundation
import SwiftUI

/// Top-level decoded journal document (the archive's `data.json`), 7.0 format.
struct JournalData: Decodable {
    var version: Double?
    var entries: [JournalEntry]
}

/// A single journal entry.
///
/// `attachments` is a list of image references stored under `images/` in the
/// archive. Decoding stays tolerant of `entryDate` being a string or epoch number
/// and of a missing `attachments`, so one odd field never fails the whole load.
final class JournalEntry: Identifiable, Decodable, ObservableObject {
    let id = UUID()
    @Published var entryDate: String
    var content: String
    var sentiment: String
    var attachments: [String]

    /// Decoded image bytes for `attachments`, resolved against the archive at open
    /// time. Not part of the JSON; populated by `JournalFile`.
    var images: [Data] = []

    private enum CodingKeys: String, CodingKey {
        case entryDate, content, sentiment, attachments
    }

    init(
        entryDate: String,
        content: String,
        sentiment: String,
        attachments: [String] = [],
        images: [Data] = []
    ) {
        self.entryDate = entryDate
        self.content = content
        self.sentiment = sentiment
        self.attachments = attachments
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

        attachments = (try? c.decode([String].self, forKey: .attachments)) ?? []
    }
}

extension JournalEntry {
    /// The mood options offered when composing an entry.
    static let sentiments = ["Happy", "Excited", "Loved", "Neutral", "Sad", "Angry"]

    /// Dot color for the entry's mood, matching the Electron build's palette.
    /// Unrecognized moods fall back to a neutral color.
    var sentimentColor: Color {
        switch sentiment {
        case "Happy": Color(red: 0, green: 0.5, blue: 0)          // green
        case "Angry": .red                                        // red
        case "Sad": Color(red: 0.984, green: 0.792, blue: 0.016)  // #FBCA04
        case "Neutral": .gray                                     // gray
        case "Loved": Color(red: 1, green: 0.412, blue: 0.706)    // hotpink
        case "Excited": Color(red: 0, green: 1, blue: 0)          // lime
        default: .primary
        }
    }

    /// Best-effort human-readable date. Falls back to the raw stored value when the
    /// format isn't recognized, so we never hide data from the user.
    var displayDate: String {
        guard let date = Self.parseDate(entryDate) else { return entryDate }
        return date.formatted(date: .abbreviated, time: .omitted)
    }

    static func parseDate(_ raw: String) -> Date? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        // Numeric epoch (seconds or milliseconds).
        if let number = Double(trimmed) {
            let seconds = number > 10_000_000_000 ? number / 1000 : number
            return Date(timeIntervalSince1970: seconds)
        }

        // ISO 8601 with a timezone designator (…Z or ±hh:mm), with or without
        // fractional seconds.
        if let date = isoFormatter.date(from: trimmed) { return date }
        if let date = isoFractionalFormatter.date(from: trimmed) { return date }

        // Timezone-less formats written by older Electron builds, e.g.
        // "2017-09-16T00:00:00" or a bare "2017-09-16". Parsed in the local
        // timezone so the displayed calendar day matches what was stored.
        for formatter in localFormatters {
            if let date = formatter.date(from: trimmed) { return date }
        }

        return nil
    }

    // Cached formatters. parseDate runs from both the sort (a background task)
    // and displayDate (main), so these are only ever read, never reconfigured —
    // Date/ISO8601 formatters are safe to parse with concurrently that way.
    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static let isoFractionalFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let localFormatters: [DateFormatter] = [
        "yyyy-MM-dd'T'HH:mm:ss.SSS",
        "yyyy-MM-dd'T'HH:mm:ss",
        "yyyy-MM-dd HH:mm:ss",
        "yyyy-MM-dd",
    ].map { format in
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = format
        return f
    }
}
