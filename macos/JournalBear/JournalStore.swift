import SwiftUI
import AppKit
import UniformTypeIdentifiers

/// Observable app state. Owns the open/decrypt flow and the loaded entries.
@MainActor
final class JournalStore: ObservableObject {
    @Published var entries: [JournalEntry] = []
    @Published var documentName: String?
    @Published var isLoading = false
    @Published var isSaving = false
    @Published var errorMessage: String?
    @Published var showPasswordPrompt = false
    @Published var showNewEntry = false

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

    /// New entries can only be added to an already-open journal.
    var canAddEntry: Bool { documentName != nil }

    /// Step 1: pick a `.zjournal` file, then prompt for its password.
    func chooseFile() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        if let type = UTType(filenameExtension: "zjournal") {
            panel.allowedContentTypes = [type]
        }

        guard panel.runModal() == .OK, let url = panel.url else { return }
        pendingURL = url
        errorMessage = nil
        showPasswordPrompt = true
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

                let sorted = data.entries.sorted {
                    let lhs = JournalEntry.parseDate($0.entryDate) ?? .distantPast
                    let rhs = JournalEntry.parseDate($1.entryDate) ?? .distantPast
                    return lhs > rhs
                }

                entries = sorted
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

    /// Stage a new entry in memory and mark the journal dirty. Nothing is written
    /// to disk until `save()` (Cmd-S), so the user can compose several entries and
    /// then commit or discard them together.
    func addEntry(_ entry: JournalEntry) {
        var updated = entries
        updated.append(entry)
        updated.sort {
            let lhs = JournalEntry.parseDate($0.entryDate) ?? .distantPast
            let rhs = JournalEntry.parseDate($1.entryDate) ?? .distantPast
            return lhs > rhs
        }
        entries = updated
        changeToken &+= 1
        hasUnsavedChanges = true
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

    private func performSave(completion: ((Bool) -> Void)?) {
        guard let url = fileURL, let password else {
            completion?(false)
            return
        }

        let toSave = entries
        let token = changeToken
        isSaving = true
        errorMessage = nil
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

    private func flashSaved() {
        justSaved = true
        Task {
            try? await Task.sleep(for: .seconds(2))
            justSaved = false
        }
    }
}
