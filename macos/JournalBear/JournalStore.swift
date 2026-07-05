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

    private var pendingURL: URL?
    private var fileURL: URL?
    private var password: String?

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

                let sorted = data.en.sorted {
                    let lhs = JournalEntry.parseDate($0.entryDate) ?? .distantPast
                    let rhs = JournalEntry.parseDate($1.entryDate) ?? .distantPast
                    return lhs > rhs
                }

                entries = sorted
                documentName = url.deletingPathExtension().lastPathComponent
                fileURL = url
                self.password = password
                pendingURL = nil
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

    /// Appends a new entry and persists the whole journal back to disk. The
    /// in-memory list is only updated once the save succeeds, so memory and disk
    /// stay consistent.
    func addEntry(_ entry: JournalEntry) {
        guard let url = fileURL, let password else { return }

        var updated = entries
        updated.append(entry)
        updated.sort {
            let lhs = JournalEntry.parseDate($0.entryDate) ?? .distantPast
            let rhs = JournalEntry.parseDate($1.entryDate) ?? .distantPast
            return lhs > rhs
        }
        let toSave = updated

        isSaving = true
        errorMessage = nil
        Task {
            do {
                try await Task.detached(priority: .userInitiated) {
                    try JournalFile.save(toSave, to: url, password: password)
                }.value
                entries = toSave
            } catch {
                errorMessage = (error as? JournalError)?.message ?? error.localizedDescription
            }
            isSaving = false
        }
    }
}
