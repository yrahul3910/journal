import SwiftUI
import AppKit

struct ContentView: View {
    @EnvironmentObject var store: JournalStore
    @State private var selection: JournalEntry.ID?
    @State private var columnVisibility = NavigationSplitViewVisibility.automatic

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            List(store.entries, selection: $selection) { entry in
                EntryRow(entry: entry)
                    .contentShape(Rectangle())
                    .onDoubleClick {
                        selection = entry.id
                        store.showNewEntry = .editing
                    }
            }
            .toolbar(removing: columnVisibility == NavigationSplitViewVisibility.all ? .sidebarToggle : nil)
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
        }
        detail: {
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
        .sheet(isPresented: Binding(
            get: { store.showNewEntry != .closed },
            set: { if !$0 { store.showNewEntry = .closed } }
        )) {
            if store.showNewEntry == .editing,
               let entry = store.entries.first(where: { $0.id == selection })
            {
                NewEntryView(
                    editingID: entry.id,
                    date: JournalEntry.parseDate(entry.entryDate) ?? Date(),
                    sentiment: entry.sentiment,
                    content: entry.content,
                    images: entry.images
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
