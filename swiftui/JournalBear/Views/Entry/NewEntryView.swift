import SwiftUI
import UniformTypeIdentifiers
#if os(iOS)
import PhotosUI
#endif

/// Compose a new journal entry. On save it's staged into the open journal in
/// memory (see `JournalStore.addEntry`); the journal is written to disk later
/// when the user invokes Save (⌘S).
struct NewEntryView: View {
    @EnvironmentObject var store: JournalStore
    @Environment(\.dismiss) private var dismiss

    /// When set, the sheet edits the entry with this id in place instead of
    /// staging a brand-new one. `nil` means compose a new entry.
    var editingID: JournalEntry.ID? = nil

    @State var date = Date()
    @State var sentiment = "Neutral"
    @State var content = ""
    @State var media: [MediaAttachment] = []

    // Snapshot the seeded values on appear so `isDirty` reflects only the
    // user's edits, not the values the dialog opened with.
    @State private var initialDate = Date()
    @State private var initialSentiment = "Neutral"
    @State private var initialContent = ""
    @State private var initialMedia: [MediaAttachment] = []

    @State private var showDiscardConfirmation = false
    @State private var showOversizedVideoAlert = false
#if os(macOS)
    @State private var showMediaImporter = false
#else
    @State private var photoSelection: [PhotosPickerItem] = []
    @State private var pendingMediaLoads = 0
#endif

    private var canSave: Bool {
#if os(iOS)
        // Picked videos can take a while to load; saving before they arrive
        // would silently drop them.
        guard pendingMediaLoads == 0 else { return false }
#endif
        return !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    // Attachments are compared by id: an attachment never changes once made,
    // and this runs on every view update, where comparing bytes would scan
    // whole videos.
    private var isDirty: Bool {
        date != initialDate ||
        sentiment != initialSentiment ||
        content != initialContent ||
        media.map(\.id) != initialMedia.map(\.id)
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(editingID == nil ? "New Entry" : "Edit Entry").font(.headline)
                Spacer()
            }
            .padding()

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    DatePicker("Date", selection: $date, displayedComponents: .date)

                    Picker("Mood", selection: $sentiment) {
                        ForEach(JournalEntry.sentiments, id: \.self) { Text($0).tag($0) }
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Entry").font(.subheadline).foregroundStyle(.secondary)
                        TextEditor(text: $content)
                            .font(.body)
                            .frame(minHeight: 180)
                            .padding(4)
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(.quaternary))
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("Attachments").font(.subheadline).foregroundStyle(.secondary)
                            Spacer()
#if os(macOS)
                            Button("Add Images or Videos…") { showMediaImporter = true }
#else
                            if pendingMediaLoads > 0 {
                                ProgressView().controlSize(.small)
                            }
                            PhotosPicker(
                                "Add Images or Videos…",
                                selection: $photoSelection,
                                matching: .any(of: [.images, .videos])
                            )
#endif
                        }
                        if !media.isEmpty {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 10) {
                                    ForEach(Array(media.enumerated()), id: \.element.id) { index, attachment in
                                        thumbnail(attachment, index: index)
                                    }
                                }
                            }
                        }
                    }
                }
                .padding()
            }

            Divider()

            HStack {
                Spacer()
                Button("Cancel", role: .cancel) { cancel() }
                    .glassButton()
                Button(editingID == nil ? "Add" : "Save", action: add)
                    .keyboardShortcut(.defaultAction)
                    .disabled(!canSave)
                    .glassButton(prominent: true)
            }
            .padding()
        }
#if os(macOS)
        .frame(width: 520, height: 640)
        .fileImporter(
            isPresented: $showMediaImporter,
            allowedContentTypes: [.png, .jpeg, .mpeg4Movie, .quickTimeMovie],
            allowsMultipleSelection: true
        ) { result in
            addMedia(from: result)
        }
#else
        .onChange(of: photoSelection) { loadPickedMedia() }
#endif
        .onAppear {
            initialDate = date
            initialSentiment = sentiment
            initialContent = content
            initialMedia = media
#if DEBUG
            if let testDraft = ProcessInfo.processInfo.environment[
                "JOURNALBEAR_UI_TEST_ENTRY_DRAFT"
            ] {
                content = testDraft
            }
#endif
        }
        // Keep Escape from silently discarding unsaved edits; the Cancel
        // button surfaces a confirmation instead.
        .interactiveDismissDisabled(isDirty)
        .alert(
            "Discard changes?",
            isPresented: $showDiscardConfirmation
        ) {
            Button("Discard Changes", role: .destructive) { dismiss() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Your entry has unsaved changes. If you discard, they will be lost.")
        }
        .alert("Video Too Large", isPresented: $showOversizedVideoAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Videos larger than \(Int64(MediaAttachment.maxVideoBytes).formatted(.byteCount(style: .memory))) can't be attached.")
        }
    }

    @ViewBuilder
    private func thumbnail(_ attachment: MediaAttachment, index: Int) -> some View {
        ZStack(alignment: .topTrailing) {
            Group {
                switch attachment.kind {
                case .image:
                    AttachmentImage(
                        data: attachment.data,
                        cacheKey: AttachmentImage.cacheKey(scope: "editor", index: index, data: attachment.data),
                        maxPixelSize: 300,
                        contentMode: .fill
                    )
                case .video:
                    Rectangle()
                        .fill(.quaternary)
                        .overlay {
                            Image(systemName: "video.fill")
                                .font(.title2)
                                .foregroundStyle(.secondary)
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("Video")
                }
            }
            .frame(width: 92, height: 92)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .accessibilityIdentifier("editor-attachment-\(index)")
            Button {
                media.remove(at: index)
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.white, .black.opacity(0.6))
            }
            .buttonStyle(.plain)
            .padding(4)
        }
    }

    /// Adds `attachment`, or raises the size alert for a video over the
    /// shared limit.
    private func attach(_ attachment: MediaAttachment) {
        if attachment.kind == .video && attachment.data.count > MediaAttachment.maxVideoBytes {
            showOversizedVideoAlert = true
        } else {
            media.append(attachment)
        }
    }

#if os(macOS)
    private func addMedia(from result: Result<[URL], Error>) {
        guard case .success(let urls) = result else { return }
        for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }

            // The importer also admits .m4v, .mpg4, and .qt files, which conform
            // to the movie types it allows, so classify by content type rather
            // than by the archive's extension rule.
            let values = try? url.resourceValues(forKeys: [.contentTypeKey, .fileSizeKey])
            let kind: MediaAttachment.Kind = values?.contentType?.conforms(to: .movie) == true ? .video : .image

            // Reject oversized videos before reading them into memory.
            if kind == .video, (values?.fileSize ?? 0) > MediaAttachment.maxVideoBytes {
                showOversizedVideoAlert = true
                continue
            }

            if let data = try? Data(contentsOf: url) {
                attach(MediaAttachment(kind: kind, data: data))
            }
        }
    }
#else
    private func loadPickedMedia() {
        let items = photoSelection
        photoSelection = []
        guard !items.isEmpty else { return }
        pendingMediaLoads += 1
        Task {
            defer { pendingMediaLoads -= 1 }

            for item in items {
                guard let data = try? await item.loadTransferable(type: Data.self) else { continue }

                if item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }) {
                    attach(MediaAttachment(kind: .video, data: data))
                } else if let normalized = normalizedImageData(data) {
                    attach(MediaAttachment(kind: .image, data: normalized))
                }
            }
        }
    }

    /// The archive only carries PNG/JPEG (the Electron app reads it), so
    /// photos picked in other formats (typically HEIC) are transcoded to JPEG.
    private func normalizedImageData(_ data: Data) -> Data? {
        let isPNG = data.count >= 4
            && data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47
        let isJPEG = data.count >= 2 && data[0] == 0xFF && data[1] == 0xD8
        if isPNG || isJPEG { return data }
        return UIImage(data: data)?.jpegData(compressionQuality: 0.9)
    }
#endif

    private func cancel() {
        if isDirty {
            showDiscardConfirmation = true
        } else {
            dismiss()
        }
    }

    private func add() {
        let entry = JournalEntry(
            entryDate: ISO8601DateFormatter().string(from: date),
            content: content,
            sentiment: sentiment,
            media: media
        )
        if let editingID {
            store.updateEntry(entry, id: editingID)
        } else {
            store.addEntry(entry)
        }
        dismiss()
    }
}
