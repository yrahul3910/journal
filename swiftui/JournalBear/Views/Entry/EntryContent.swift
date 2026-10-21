import Foundation
import SwiftUI
import Textual
#if os(iOS)
import UIKit
#endif

struct EntryContent: View {
    @EnvironmentObject private var store: JournalStore
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
            
            if !entry.media.isEmpty {
                Divider()
                Label(
                    "^[\(entry.media.count) attachment](inflect: true)",
                    systemImage: "paperclip"
                )
                .font(.callout)
                .foregroundStyle(.secondary)
                
                ForEach(Array(entry.media.enumerated()), id: \.element.id) { index, attachment in
                    switch attachment.kind {
                    case .image:
                        imageButton(attachment.data, index: index)
                    case .video:
                        AttachmentVideo(data: attachment.data)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .frame(maxWidth: .infinity, maxHeight: 480, alignment: .leading)
                            // The platform player view drops identifiers, so a
                            // container element carries it around the controls.
                            .accessibilityElement(children: .contain)
                            .accessibilityIdentifier("entry-attachment-\(index)")
                            .accessibilityLabel("Video attachment \(index + 1)")
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
#if os(iOS)
        .fullScreenCover(item: $preview) { preview in
            AttachmentPreviewView(
                images: images,
                cacheScope: entry.id.uuidString,
                startAt: preview.index
            )
#if DEBUG
            .onAppear {
                if ProcessInfo.processInfo.environment[
                    "JOURNALBEAR_UI_TEST_LOCK_ATTACHMENT_PREVIEW"
                ] == "1" {
                    NotificationCenter.default.post(
                        name: UIApplication.protectedDataWillBecomeUnavailableNotification,
                        object: nil
                    )
                }
            }
#endif
        }
        .onChange(of: store.isLocked) {
            if store.isLocked {
                preview = nil
            }
        }
#endif
    }

    /// The entry's images, which the full-size viewer pages through. Videos
    /// play inline instead, so they are left out.
    private var images: [Data] {
        entry.media.filter { $0.kind == .image }.map(\.data)
    }

    /// An inline image that opens the full-size viewer. `index` is the
    /// image's position among all of the entry's attachments.
    private func imageButton(_ data: Data, index: Int) -> some View {
        let imageIndex = entry.media[..<index].count { $0.kind == .image }

        return Button {
#if os(macOS)
            AttachmentPreviewWindowController.shared.show(
                images: images,
                cacheScope: entry.id.uuidString,
                startAt: imageIndex
            )
#else
            preview = AttachmentPreview(index: imageIndex)
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
