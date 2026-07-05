import SwiftUI
import AppKit
import UniformTypeIdentifiers

/// Compose a new journal entry. On save it's staged into the open journal in
/// memory (see `JournalStore.addEntry`); the journal is written to disk later
/// when the user invokes Save (⌘S).
struct NewEntryView: View {
    @EnvironmentObject var store: JournalStore
    @Environment(\.dismiss) private var dismiss

    @State private var date = Date()
    @State private var sentiment = "Neutral"
    @State private var content = ""
    @State private var images: [Data] = []
    @State private var nsfw = false

    private var canSave: Bool {
        !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("New Entry").font(.headline)
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
                            Button("Add Images…", action: addImages)
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

                    Toggle("Mark as NSFW", isOn: $nsfw)
                }
                .padding()
            }

            Divider()

            HStack {
                Spacer()
                Button("Cancel", role: .cancel) { dismiss() }
                Button("Add", action: add)
                    .keyboardShortcut(.defaultAction)
                    .disabled(!canSave)
            }
            .padding()
        }
        .frame(width: 520, height: 640)
    }

    @ViewBuilder
    private func thumbnail(_ data: Data, index: Int) -> some View {
        if let image = NSImage(data: data) {
            ZStack(alignment: .topTrailing) {
                Image(nsImage: image)
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

    private func addImages() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowedContentTypes = [.png, .jpeg]
        guard panel.runModal() == .OK else { return }
        for url in panel.urls {
            if let data = try? Data(contentsOf: url) { images.append(data) }
        }
    }

    private func add() {
        let entry = JournalEntry(
            entryDate: ISO8601DateFormatter().string(from: date),
            content: content,
            sentiment: sentiment,
            nsfw: nsfw,
            images: images
        )
        store.addEntry(entry)
        dismiss()
    }
}
