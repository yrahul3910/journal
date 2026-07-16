import SwiftUI
import AppKit

struct ContentView: View {
    @EnvironmentObject var store: JournalStore
    @State private var selection: JournalEntry.ID?
    @State private var columnVisibility = NavigationSplitViewVisibility.automatic
    @State private var searchText = ""
    @State private var searchCriteria = EntrySearchCriteria()

    private var visibleEntries: [JournalEntry] {
        searchCriteria.filter(store.entries)
    }

    private var visibleEntryIDs: [JournalEntry.ID] {
        visibleEntries.map(\.id)
    }

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            VStack(spacing: 0) {
                if store.documentName != nil && !store.entries.isEmpty {
                    EntrySearchControls(
                        criteria: $searchCriteria,
                        resultCount: visibleEntries.count,
                        onShowAll: showAllEntries
                    )
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                }

                List(visibleEntries, selection: $selection) { entry in
                    EntryRow(entry: entry)
                        .contentShape(Rectangle())
                        .onDoubleClick {
                            selection = entry.id
                            store.showNewEntry = .editing
                        }
                }
                .overlay {
                    if store.entries.isEmpty && !store.isLoading {
                        ContentUnavailableView {
                            Label(
                                store.documentName == nil ? "No Journal Open" : "No Entries",
                                systemImage: store.documentName == nil ? "book.closed" : "book.pages"
                            )
                        } description: {
                            if store.documentName == nil {
                                Text("Open a .zjournal file to read your entries.")
                            } else {
                                Text("This journal does not have any entries yet.")
                            }
                        } actions: {
                            if store.documentName == nil {
                                Button("Open Journal...") { store.chooseFile() }
                                Button("New Journal...") { store.newJournal() }
                            } else {
                                Button("New Entry") { store.showNewEntry = .new }
                            }
                        }
                    } else if visibleEntries.isEmpty && searchCriteria.isActive {
                        ContentUnavailableView {
                            Label("No Matching Entries", systemImage: "magnifyingglass")
                        } description: {
                            Text("Try another search or change the filters.")
                        } actions: {
                            Button("Show All Entries", action: showAllEntries)
                                .glassButton()
                        }
                    }
                }
            }
            .toolbar(removing: columnVisibility == NavigationSplitViewVisibility.all ? .sidebarToggle : nil)
        }
        detail: {
            EntryDetail(entry: store.entries.first(where: { $0.id == selection }))
        }
        .searchable(text: $searchText, placement: .sidebar, prompt: "Search entries")
        .onSubmit(of: .search, submitSearch)
        .onKeyPress(.return) {
            guard let editor = NSApp.keyWindow?.firstResponder as? NSTextView,
                  editor.delegate is NSSearchField
            else {
                return .ignored
            }

            // The macOS 26 sidebar search field does not emit SwiftUI's search
            // submit trigger when Return is pressed.
            submitSearch()
            return .handled
        }
        .onChange(of: searchText) {
            if searchText.isEmpty {
                searchCriteria.text = ""
            }
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
        .sheet(isPresented: $store.showNewJournalPrompt) {
            NewJournalView()
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
        .fileImporter(
            isPresented: $store.showJournalImporter,
            allowedContentTypes: [EncryptedJournalDocument.contentType]
        ) { result in
            store.journalImported(result)
        }
        .fileExporter(
            isPresented: $store.showJournalExporter,
            document: store.exportDocument,
            contentTypes: [EncryptedJournalDocument.contentType],
            defaultFilename: store.documentName ?? "Untitled",
            onCompletion: { store.journalExported($0) },
            onCancellation: { store.journalExportCancelled() }
        )
        .alert(
            "Save changes before creating a new journal?",
            isPresented: $store.showUnsavedChangesDialog
        ) {
            Button("Save") { store.saveThenNewJournal() }
                .keyboardShortcut(.defaultAction)
            Button("Discard", role: .destructive) { store.discardThenNewJournal() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The open journal has unsaved changes. If you don't save, they will be lost.")
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
            showAllEntries()
            selection = store.entries.first?.id
        }
        .onChange(of: visibleEntryIDs) {
            if selection.map({ visibleEntryIDs.contains($0) }) != true {
                selection = visibleEntryIDs.first
            }
        }
    }

    private func submitSearch() {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        searchText = query
        searchCriteria.text = query
    }

    private func showAllEntries() {
        searchText = ""
        searchCriteria = EntrySearchCriteria()
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
