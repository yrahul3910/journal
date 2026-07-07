import SwiftUI
import AppKit

struct ContentView: View {
    @EnvironmentObject var store: JournalStore
    @State private var selection: JournalEntry.ID?

    var body: some View {
        NavigationSplitView {
            List(store.entries, selection: $selection) { entry in
                EntryRow(entry: entry)
                    .contentShape(Rectangle())
                    .onDoubleClick {
                        selection = entry.id
                        store.showNewEntry = true
                    }
            }
            .overlay {
                if store.entries.isEmpty && !store.isLoading {
                    ContentUnavailableView {
                        Label("No Journal Open", systemImage: "book.closed")
                    } description: {
                        Text("Open a .zjournal file to read your entries.")
                    } actions: {
                        Button("Open Journal…") { store.chooseFile() }
                    }
                }
            }
        } detail: {
            EntryDetail(entry: store.entries.first(where: { $0.id == selection }))
        }
        .toolbar(removing: .title)
        .overlay {
            if store.isLoading || store.isSaving {
                ProgressView(store.isSaving ? "Saving…" : "Opening…")
                    .padding(24)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .overlay(alignment: .bottom) {
            if store.justSaved {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    Text("Saved")
                }
                .font(.callout.weight(.medium))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .glassCapsule()
                .padding(.bottom, 24)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.25), value: store.justSaved)
        .sheet(isPresented: $store.showPasswordPrompt) {
            PasswordPrompt()
                .environmentObject(store)
        }
        .sheet(isPresented: $store.showNewEntry) {
            if let entry = store.entries.first(where: { $0.id == selection }) {
                NewEntryView(
                    editingID: entry.id,
                    date: JournalEntry.parseDate(entry.entryDate) ?? Date(),
                    sentiment: entry.sentiment,
                    content: entry.content,
                    images: entry.images,
                    nsfw: entry.nsfw
                )
                .environmentObject(store)
            } else {
                NewEntryView()
                    .environmentObject(store)
            }
        }
        .alert(
            "Couldn't Open Journal",
            isPresented: Binding(
                get: { store.errorMessage != nil },
                set: { if !$0 { store.errorMessage = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(store.errorMessage ?? "")
        }
        .frame(minWidth: 820, minHeight: 520)
        .onChange(of: store.documentName) {
            // Auto-select the first entry whenever a new journal is opened.
            selection = store.entries.first?.id
        }
    }
}

private struct EntryRow: View {
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

// The scroll view, its toolbar, and the safe-area underlap must exist from
// window creation: swapping in a different detail view after launch leaves the
// window toolbar opaque instead of the scroll edge effect. So the empty state
// is an overlay here rather than a separate detail view.
private struct EntryDetail: View {
    @EnvironmentObject var store: JournalStore
    let entry: JournalEntry?

    var body: some View {
        ScrollView {
            if let entry {
                EntryContent(entry: entry)
            }
        }
        .overlay {
            if entry == nil {
                Text("Select an entry")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
        }
        .scrollEdgeEffectStyle(.soft, for: .top)
        .toolbar {
            ToolbarSpacer(.flexible)
            ToolbarItem {
                Button {
                    store.showNewEntry = true
                } label: {
                    Image(systemName: "pencil")
                }
                .buttonBorderShape(.circle)
                .help("Edit this entry")
                .disabled(entry == nil)
            }
        }
        .toolbar(removing: .title)
        .ignoresSafeArea(edges: .top)
    }
}

private struct EntryContent: View {
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

private struct PasswordPrompt: View {
    @EnvironmentObject var store: JournalStore
    @State private var password = ""

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "lock.fill")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("Enter Password")
                .font(.headline)

            SecureField("Password", text: $password)
                .textFieldStyle(.roundedBorder)
                .frame(width: 260)
                .onSubmit { store.submitPassword(password) }

            HStack {
                Button("Cancel", role: .cancel) { store.cancelPassword() }
                    .glassButton()
                Button("Open") { store.submitPassword(password) }
                    .keyboardShortcut(.defaultAction)
                    .disabled(password.isEmpty)
                    .glassButton(prominent: true)
            }
        }
        .padding(28)
        .frame(width: 340)
    }
}
