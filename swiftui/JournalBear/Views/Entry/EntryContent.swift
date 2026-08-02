import Foundation
import SwiftUI
import Textual

struct EntryContent: View {
    let entry: JournalEntry
#if os(iOS)
    @State private var preview: AttachmentPreview?
#endif

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
                
                ForEach(Array(entry.images.enumerated()), id: \.offset) { index, data in
                    Button {
#if os(macOS)
                        AttachmentPreviewWindowController.shared.show(
                            images: entry.images,
                            cacheScope: entry.id.uuidString,
                            startAt: index
                        )
#else
                        preview = AttachmentPreview(index: index)
#endif
                    } label: {
                        AttachmentImage(
                            data: data,
                            cacheKey: AttachmentImage.cacheKey(
                                scope: entry.id.uuidString, index: index, data: data
                            )
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                    .frame(maxWidth: .infinity, maxHeight: 480, alignment: .leading)
                    .accessibilityIdentifier("entry-attachment-\(index)")
                    .accessibilityLabel("Attachment \(index + 1)")
                    .help("View full size")
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
#if os(iOS)
        .fullScreenCover(item: $preview) { preview in
            AttachmentPreviewView(
                images: entry.images,
                cacheScope: entry.id.uuidString,
                startAt: preview.index
            )
        }
#endif
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
