import SwiftUI

struct EntrySearchControls: View {
    @Binding var criteria: EntrySearchCriteria
    let resultCount: Int
    let onShowAll: () -> Void
    
    private var filterCount: Int {
        (criteria.sentiment == nil ? 0 : 1) + (criteria.hasAttachments ? 1 : 0)
    }
    
    var body: some View {
        HStack(spacing: 8) {
            Menu {
                Picker("Mood", selection: $criteria.sentiment) {
                    Text("Any Mood").tag(nil as String?)
                    ForEach(JournalEntry.sentiments, id: \.self) { sentiment in
                        Text(sentiment).tag(Optional(sentiment))
                    }
                }
                
                Toggle("Has Attachments", isOn: $criteria.hasAttachments)
                
                if filterCount > 0 {
                    Divider()
                    Button("Clear Filters") {
                        criteria.sentiment = nil
                        criteria.hasAttachments = false
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "line.3.horizontal.decrease")
                    Text(filterCount == 0 ? "Filter" : "Filter (\(filterCount))")
                }
            }
            .menuIndicator(.hidden)
            .glassButton()
            .help("Filter Entries")
            .accessibilityLabel(
                filterCount == 0 ? "Filter Entries" : "Filter Entries, \(filterCount) active"
            )
            
            if criteria.isActive {
                Text("^[\(resultCount) entry](inflect: true)")
                    .foregroundStyle(.secondary)
                    .accessibilityLabel(
                        resultCount == 1 ? "1 entry" : "\(resultCount) entries"
                    )
                    .accessibilityIdentifier("search-result-count")
                Spacer(minLength: 0)
                Button("Show All", action: onShowAll)
                    .buttonStyle(.plain)
                    .foregroundStyle(.tint)
            } else {
                Spacer(minLength: 0)
            }
        }
        .font(.caption)
    }
}
