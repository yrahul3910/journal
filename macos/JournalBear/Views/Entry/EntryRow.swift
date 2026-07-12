import SwiftUI

struct EntryRow: View {
    let entry: JournalEntry
    
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
            Text(entry.content)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .padding(.vertical, 3)
    }
}
