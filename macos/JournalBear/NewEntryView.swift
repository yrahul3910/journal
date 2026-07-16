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
    @State var images: [Data] = []

    // Snapshot the seeded values on appear so `isDirty` reflects only the
    // user's edits, not the values the dialog opened with.
    @State private var initialDate = Date()
    @State private var initialSentiment = "Neutral"
    @State private var initialContent = ""
    @State private var initialImages: [Data] = []

    @State private var showDiscardConfirmation = false
#if os(macOS)
    @State private var showImageImporter = false
#else
    @State private var photoSelection: [PhotosPickerItem] = []
#endif

    private var canSave: Bool {
        !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var isDirty: Bool {
        date != initialDate ||
        sentiment != initialSentiment ||
        content != initialContent ||
        images != initialImages
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
                            Button("Add Images…") { showImageImporter = true }
#else
                            PhotosPicker("Add Images…", selection: $photoSelection, matching: .images)
#endif
                        }
                        if !images.isEmpty {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 10) {
                                    ForEach(Array(images.enumerated()), id: \.offset) { index, data in
                                        thumbnail(data, index: index)
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
            isPresented: $showImageImporter,
            allowedContentTypes: [.png, .jpeg],
            allowsMultipleSelection: true
        ) { result in
            addImages(from: result)
        }
#else
        .onChange(of: photoSelection) { loadPickedPhotos() }
#endif
        .onAppear {
            initialDate = date
            initialSentiment = sentiment
            initialContent = content
            initialImages = images
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
    }

    @ViewBuilder
    private func thumbnail(_ data: Data, index: Int) -> some View {
        if let image = PlatformImage(data: data) {
            ZStack(alignment: .topTrailing) {
                Image(platformImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 92, height: 92)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                Button {
                    images.remove(at: index)
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.white, .black.opacity(0.6))
                }
                .buttonStyle(.plain)
                .padding(4)
            }
        }
    }

#if os(macOS)
    private func addImages(from result: Result<[URL], Error>) {
        guard case .success(let urls) = result else { return }
        for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            if let data = try? Data(contentsOf: url) { images.append(data) }
        }
    }
#else
    private func loadPickedPhotos() {
        let items = photoSelection
        photoSelection = []
        guard !items.isEmpty else { return }
        Task {
            for item in items {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let normalized = normalizedImageData(data) {
                    images.append(normalized)
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
            images: images
        )
        if let editingID {
            store.updateEntry(entry, id: editingID)
        } else {
            store.addEntry(entry)
        }
        dismiss()
    }
}
