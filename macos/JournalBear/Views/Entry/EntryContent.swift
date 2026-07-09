import SwiftUI

struct EntryContent: View {
    let entry: JournalEntry
    
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(entry.displayDate)
                .font(.title2.bold())
            Text(entry.sentiment)
                .font(.callout)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .glassCapsule()
            
            Divider()
            
            Text(entry.attributedContent)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
            
            if !entry.images.isEmpty {
                Divider()
                Label(
                    "^[\(entry.images.count) attachment](inflect: true)",
                    systemImage: "paperclip"
                )
                .font(.callout)
                .foregroundStyle(.secondary)
                
                ForEach(Array(entry.images.enumerated()), id: \.offset) { _, data in
                    if let image = NSImage(data: data) {
                        Image(nsImage: image)
                            .resizable()
                            .scaledToFit()
                            .frame(maxWidth: .infinity, maxHeight: 480, alignment: .leading)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
            } else if !entry.attachments.isEmpty {
                Label(
                    "Couldn't load ^[\(entry.attachments.count) attachment](inflect: true)",
                    systemImage: "exclamationmark.triangle"
                )
                .font(.callout)
                .foregroundStyle(.secondary)
            }
        }
        .padding(28)
    }
}
