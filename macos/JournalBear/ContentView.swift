import SwiftUI
#if os(macOS)
import AppKit
#endif

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
#if os(macOS)
                if store.documentName != nil && !store.entries.isEmpty {
                    EntrySearchControls(
                        criteria: $searchCriteria,
                        resultCount: visibleEntries.count,
                        onShowAll: showAllEntries
                    )
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                }
#endif

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
#if os(iOS)
            // The list column is the whole screen here, so it carries the
            // journal name and, mid-search, the match count. The filter menu
            // moves from the macOS search-controls row into the toolbar.
            .navigationTitle(store.documentName ?? "JournalBear")
            .navigationSubtitle(
                searchCriteria.isActive
                    ? "\(visibleEntries.count) \(visibleEntries.count == 1 ? "entry" : "entries")"
                    : ""
            )
            // The New Entry / Save menu commands have no keyboard to live on
            // here, so they get toolbar buttons instead.
            .toolbar {
                if store.documentName != nil && !store.entries.isEmpty {
                    ToolbarItem(placement: .topBarLeading) {
                        EntryFilterMenu(criteria: $searchCriteria)
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        store.showNewEntry = .new
                    } label: {
                        Label("New Entry", systemImage: "plus")
                    }
                    .disabled(!store.canAddEntry)
                }
                ToolbarItem {
                    Button {
                        store.save()
                    } label: {
                        Label("Save", systemImage: "square.and.arrow.down")
                    }
                    .disabled(!store.hasUnsavedChanges)
                }
            }
#endif
        }
        detail: {
            EntryDetail(entry: store.entries.first(where: { $0.id == selection }))
        }
        .searchable(text: $searchText, placement: .sidebar, prompt: "Search entries")
        .onSubmit(of: .search, submitSearch)
#if os(macOS)
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
#endif
        .onChange(of: searchText) {
            if searchText.isEmpty {
                searchCriteria.text = ""
            }
        }
#if os(macOS)
        .toolbar(removing: .title)
#endif
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
#if os(macOS)
                .padding(.bottom, 24)
#else
                // Clear the bottom-docked search field.
                .padding(.bottom, 96)
#endif
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
#if os(macOS)
        .frame(minWidth: 820, minHeight: 520)
#endif
        .onChange(of: store.documentName) {
            showAllEntries()
            // Auto-selecting is right for the Mac's always-visible detail
            // column; on iPhone it would push the detail over the list.
#if os(macOS)
            selection = store.entries.first?.id
#endif
        }
        .onChange(of: visibleEntryIDs) {
            if selection.map({ visibleEntryIDs.contains($0) }) != true {
#if os(macOS)
                selection = visibleEntryIDs.first
#else
                selection = nil
#endif
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
#if os(macOS)
                .frame(width: 260)
#endif
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
#if os(macOS)
        .frame(width: 340)
#else
        .presentationDetents([.medium])
#endif
    }
}
