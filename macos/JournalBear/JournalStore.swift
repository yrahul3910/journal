import SwiftUI

enum NewEntryDialogState: Int {
    case closed
    case editing
    case new
}

/// Observable app state. Owns the open/decrypt flow and the loaded entries.
@MainActor
final class JournalStore: ObservableObject {
    @Published var entries: [JournalEntry] = []
    @Published var documentName: String?
    @Published var isLoading = false
    @Published var isSaving = false
    @Published var errorMessage: String?
    @Published var showPasswordPrompt = false
    @Published var showNewJournalPrompt = false
    @Published var showNewEntry = NewEntryDialogState.closed
    @Published var showJournalImporter = false
    @Published var showJournalExporter = false
    /// Asks whether to save/discard/cancel when a new journal is requested
    /// while the open one has unsaved changes.
    @Published var showUnsavedChangesDialog = false
    /// Encrypted bytes staged for the exporter while it asks where a
    /// brand-new journal's `.zjournal` file should go.
    @Published private(set) var exportDocument: EncryptedJournalDocument?

    /// True when there are staged changes not yet written to disk. Drives the
    /// Save affordance's enabled state and the quit-confirmation prompt.
    @Published var hasUnsavedChanges = false
    /// Briefly true right after a successful save, to flash a "Saved" confirmation.
    @Published var justSaved = false

    private var pendingURL: URL?
    private var fileURL: URL?
    private var password: String?
    /// Bumped on every staged change so a save can tell whether more edits
    /// arrived while it was writing (and therefore must stay dirty).
    private var changeToken = 0
    /// The `changeToken` snapshot and caller completion for an in-flight
    /// export, consumed when the exporter reports back.
    private var exportToken = 0
    private var exportCompletion: ((Bool) -> Void)?
#if DEBUG
    private var didLoadUITestJournal = false
#endif

    /// New entries can only be added to an already-open journal.
    var canAddEntry: Bool { documentName != nil }

    /// Step 1: pick a `.zjournal` file, then prompt for its password. The
    /// picking happens in the view layer's `fileImporter`, which reports back
    /// through `journalImported`.
    func chooseFile() {
        showJournalImporter = true
    }

    func journalImported(_ result: Result<URL, Error>) {
        switch result {
        case .success(let url):
            pendingURL = url
            errorMessage = nil
            showPasswordPrompt = true
        case .failure(let error):
            errorMessage = error.localizedDescription
        }
    }

    /// Step 2: decrypt + decompress + parse off the main thread, then publish results.
    func submitPassword(_ password: String) {
        guard let url = pendingURL else { return }
        showPasswordPrompt = false
        isLoading = true
        errorMessage = nil

        Task {
            do {
                let data = try await Task.detached(priority: .userInitiated) {
                    try JournalFile.open(url: url, password: password)
                }.value

                entries = sortedByDateDescending(data.entries)
                documentName = url.deletingPathExtension().lastPathComponent
                fileURL = url
                self.password = password
                pendingURL = nil
                hasUnsavedChanges = false
                changeToken = 0
            } catch {
                errorMessage = (error as? JournalError)?.message ?? error.localizedDescription
            }
            isLoading = false
        }
    }

    func cancelPassword() {
        showPasswordPrompt = false
        pendingURL = nil
    }

    /// Start the new-journal flow: confirm away any unsaved changes in the
    /// currently open journal (via the view layer's unsaved-changes alert),
    /// then show the create sheet.
    func newJournal() {
        if hasUnsavedChanges {
            showUnsavedChangesDialog = true
        } else {
            showNewJournalPrompt = true
        }
    }

    /// "Save" from the unsaved-changes alert: continue to the create sheet
    /// only once the journal is actually on disk.
    func saveThenNewJournal() {
        save { success in
            if success { self.showNewJournalPrompt = true }
        }
    }

    func discardThenNewJournal() {
        showNewJournalPrompt = true
    }

    /// Replace the app state with a fresh, empty journal encrypted with
    /// `password`. Like the Electron app, the new journal lives only in memory;
    /// the first `save()` asks where the `.zjournal` file should go.
    func createJournal(password: String) {
        entries = []
        documentName = "Untitled"
        fileURL = nil
        self.password = password
        pendingURL = nil
        showNewJournalPrompt = false
        hasUnsavedChanges = true
        changeToken = 0
    }

#if DEBUG
    func loadUITestJournalIfConfigured() {
        guard !didLoadUITestJournal else { return }
        didLoadUITestJournal = true

        let environment = ProcessInfo.processInfo.environment
        if let content = environment["JOURNALBEAR_UI_TEST_ENTRY_CONTENT"] {
            entries = [
                JournalEntry(
                    entryDate: "2026-01-01T00:00:00Z",
                    content: content,
                    sentiment: "Neutral"
                )
            ]
            documentName = "UI Test Journal"
            return
        }

        guard let path = environment["JOURNALBEAR_UI_TEST_JOURNAL"],
              let password = environment["JOURNALBEAR_UI_TEST_PASSWORD"]
        else {
            return
        }

        pendingURL = URL(fileURLWithPath: path)
        submitPassword(password)
    }
#endif

    /// Stage a new entry in memory and mark the journal dirty. Nothing is written
    /// to disk until `save()` (Cmd-S), so the user can compose several entries and
    /// then commit or discard them together.
    func addEntry(_ entry: JournalEntry) {
        entries = sortedByDateDescending(entries + [entry])
        changeToken &+= 1
        hasUnsavedChanges = true
    }

    /// Stage edits to an existing entry, matched by `id`. The entry's identity is
    /// preserved (fields are copied onto the existing element) so any current
    /// selection keeps pointing at it. Falls back to adding if `id` is gone.
    /// Like `addEntry`, this only stages; disk isn't touched until `save()`.
    func updateEntry(_ entry: JournalEntry, id: JournalEntry.ID) {
        guard let index = entries.firstIndex(where: { $0.id == id }) else {
            addEntry(entry)
            return
        }
        var updated = entries
        updated[index].entryDate = entry.entryDate
        updated[index].content = entry.content
        updated[index].sentiment = entry.sentiment
        updated[index].images = entry.images
        entries = sortedByDateDescending(updated)
        changeToken &+= 1
        hasUnsavedChanges = true
    }

    /// Entries newest-first, the order used everywhere they're displayed. Entries
    /// with an unparseable date sort to the end.
    private func sortedByDateDescending(_ list: [JournalEntry]) -> [JournalEntry] {
        list.sorted {
            let lhs = JournalEntry.parseDate($0.entryDate) ?? .distantPast
            let rhs = JournalEntry.parseDate($1.entryDate) ?? .distantPast
            return lhs > rhs
        }
    }

    /// Persist all staged changes by re-encrypting the whole journal to its file.
    /// Triggered by Cmd-S / the Save toolbar button; a no-op when clean or busy.
    func save() {
        guard hasUnsavedChanges, !isSaving else { return }
        performSave(completion: nil)
    }

    /// Save on behalf of app termination. `completion(true)` fires once the file
    /// is written so the caller can allow the quit to proceed.
    func save(then completion: @escaping (Bool) -> Void) {
        performSave(completion: completion)
    }

    /// Best-effort save when the scene moves to the background (iOS has no
    /// quit hook to confirm unsaved changes). A journal without a file yet
    /// can't be saved without presenting the exporter, so it stays staged in
    /// memory instead.
    func autosaveIfPossible() {
        guard fileURL != nil else { return }
        save()
    }

    private func performSave(completion: ((Bool) -> Void)?) {
        guard let password else {
            completion?(false)
            return
        }

        let toSave = entries
        let token = changeToken
        isSaving = true
        errorMessage = nil

        // A journal created in-app has no file yet: encrypt to memory, then
        // hand the bytes to the view layer's `fileExporter`, which asks where
        // the `.zjournal` file should go, writes it, and reports back through
        // `journalExported` / `journalExportCancelled`.
        guard let url = fileURL else {
            Task {
                do {
                    let data = try await Task.detached(priority: .userInitiated) {
                        try JournalFile.encrypt(toSave, password: password)
                    }.value
                    isSaving = false
                    exportDocument = EncryptedJournalDocument(data: data)
                    exportToken = token
                    exportCompletion = completion
                    showJournalExporter = true
                } catch {
                    errorMessage = (error as? JournalError)?.message ?? error.localizedDescription
                    isSaving = false
                    completion?(false)
                }
            }
            return
        }

        Task {
            do {
                try await Task.detached(priority: .userInitiated) {
                    try JournalFile.save(toSave, to: url, password: password)
                }.value
                // Only clear the flag if no further edits were staged mid-save.
                if changeToken == token { hasUnsavedChanges = false }
                isSaving = false
                flashSaved()
                completion?(true)
            } catch {
                errorMessage = (error as? JournalError)?.message ?? error.localizedDescription
                isSaving = false
                completion?(false)
            }
        }
    }

    func journalExported(_ result: Result<URL, Error>) {
        let completion = exportCompletion
        exportCompletion = nil
        exportDocument = nil

        switch result {
        case .success(let url):
            fileURL = url
            documentName = url.deletingPathExtension().lastPathComponent
            if changeToken == exportToken { hasUnsavedChanges = false }
            flashSaved()
            completion?(true)
        case .failure(let error):
            errorMessage = error.localizedDescription
            completion?(false)
        }
    }

    /// The exporter was dismissed without picking a location; the journal
    /// stays dirty in memory.
    func journalExportCancelled() {
        exportDocument = nil
        let completion = exportCompletion
        exportCompletion = nil
        completion?(false)
    }

    private func flashSaved() {
        justSaved = true
        Task {
            try? await Task.sleep(for: .seconds(2))
            justSaved = false
        }
    }
}
