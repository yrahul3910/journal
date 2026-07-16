import SwiftUI

struct EntryRow: View {
    let entry: JournalEntry

    /// The entry's Markdown reduced to plain text for the two-line preview,
    /// so rows don't show raw `#`/`-`/`**` syntax. Parsing is capped to a
    /// prefix; a preview never needs the whole entry.
    private var preview: String {
        let source = String(entry.content.prefix(400))
        guard let parsed = try? AttributedString(markdown: source) else { return source }
        // Parsed blocks (one presentation-intent run each) concatenate with
        // no separator, so join them with a space to keep words apart.
        return parsed.runs[\.presentationIntent].map { _, range in
            String(parsed.characters[range]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        .filter { !$0.isEmpty }
        .joined(separator: " ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Circle()
                    .fill(entry.sentimentColor)
                    .frame(width: 8, height: 8)
                    .accessibilityLabel("Mood: \(entry.sentiment)")
                Text(entry.displayDate)
                    .font(.subheadline.weight(.semibold))
                if !entry.attachments.isEmpty {
                    Image(systemName: "paperclip")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityLabel(
                            "^[\(entry.attachments.count) attachment](inflect: true)"
                        )
                }
                Spacer(minLength: 0)
            }
            Text(preview)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .padding(.vertical, 3)
    }
}
