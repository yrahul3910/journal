import Foundation
import SwiftUI
import Textual

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
            
            StructuredText(markdown: entry.content)
                .textual.imageAttachmentLoader(DisabledMarkdownImageLoader())
                .textual.textSelection(.enabled)
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
                    if let image = PlatformImage(data: data) {
                        Image(platformImage: image)
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

/// Journal attachments are decrypted locally and shown below the entry. Do not
/// fetch URLs from entry Markdown while viewing a private journal.
struct DisabledMarkdownImageLoader: AttachmentLoader {
    func attachment(
        for _: URL,
        text _: String,
        environment _: ColorEnvironmentValues
    ) async throws -> AnyAttachment {
        throw URLError(.unsupportedURL)
    }
}
