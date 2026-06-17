import SwiftUI
import AppKit

struct ContentView: View {
    @EnvironmentObject var store: JournalStore

    var body: some View {
        NavigationSplitView {
            List(store.entries, selection: $store.selection) { entry in
                EntryRow(entry: entry)
            }
            .navigationTitle(store.documentName ?? "JournalBear")
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
            if let entry = store.entry(for: store.selection) {
                EntryDetail(entry: entry)
            } else {
                Text("Select an entry")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
        }
        .toolbar {
            ToolbarItem {
                Button {
                    store.chooseFile()
                } label: {
                    Label("Open", systemImage: "folder")
                }
                .help("Open a journal")
            }
        }
        .overlay {
            if store.isLoading {
                ProgressView("Opening…")
                    .padding(24)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .sheet(isPresented: $store.showPasswordPrompt) {
            PasswordPrompt()
                .environmentObject(store)
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
    }
}

private struct EntryRow: View {
    let entry: JournalEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(entry.displayDate)
                .font(.subheadline.weight(.semibold))
            Text(entry.content)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .padding(.vertical, 3)
    }
}

private struct EntryDetail: View {
    let entry: JournalEntry

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline) {
                    Text(entry.displayDate)
                        .font(.title2.bold())
                    Spacer()
                    Text(entry.sentiment)
                        .font(.callout)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(.quaternary, in: Capsule())
                }

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
                } else if !entry.attachment.isEmpty {
                    Label(
                        "Couldn't load ^[\(entry.attachment.count) attachment](inflect: true)",
                        systemImage: "exclamationmark.triangle"
                    )
                    .font(.callout)
                    .foregroundStyle(.secondary)
                }
            }
            .padding(28)
        }
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
                Button("Open") { store.submitPassword(password) }
                    .keyboardShortcut(.defaultAction)
                    .disabled(password.isEmpty)
            }
        }
        .padding(28)
        .frame(width: 340)
    }
}
