import Testing
import Foundation
@testable import JournalBear

/// The unsaved-changes confirmation that guards everything replacing the open
/// journal (new journal, file picker, Files/Finder opens).
@MainActor
struct JournalStoreUnsavedChangesTests {
    private let url = URL(fileURLWithPath: "/tmp/other.zjournal")

    @Test func openOverCleanStateGoesStraightToPassword() {
        let store = JournalStore()
        store.openJournal(at: url)
        #expect(store.showPasswordPrompt)
        #expect(!store.showUnsavedChangesDialog)
    }

    @Test func openOverUnsavedChangesAsksFirstAndDiscardContinues() {
        let store = JournalStore()
        store.createJournal(password: "$Password123") // dirty until first save
        store.openJournal(at: url)
        #expect(store.showUnsavedChangesDialog)
        #expect(!store.showPasswordPrompt)
        #expect(store.unsavedChangesPrompt == "Save changes before opening another journal?")

        store.discardThenContinue()
        #expect(store.showPasswordPrompt)
    }

    @Test func chooseFileOverUnsavedChangesAsksFirst() {
        let store = JournalStore()
        store.createJournal(password: "$Password123")
        store.chooseFile()
        #expect(store.showUnsavedChangesDialog)
        #expect(!store.showJournalImporter)

        store.discardThenContinue()
        #expect(store.showJournalImporter)
    }

    @Test func newJournalPromptKeepsItsOwnTitle() {
        let store = JournalStore()
        store.createJournal(password: "$Password123")
        store.newJournal()
        #expect(store.showUnsavedChangesDialog)
        #expect(store.unsavedChangesPrompt == "Save changes before creating a new journal?")
    }

    @Test func cancelDropsThePendingActionEntirely() {
        let store = JournalStore()
        store.createJournal(password: "$Password123")
        store.chooseFile()
        store.cancelUnsavedChanges()

        // Nothing pending anymore; a stray continue must be a no-op.
        store.discardThenContinue()
        #expect(!store.showJournalImporter)
        #expect(!store.showPasswordPrompt)
        #expect(store.hasUnsavedChanges)
    }
}

@MainActor
struct JournalStoreLockTests {
    @Test func journalMustBeOpenBeforeItCanLock() {
        let store = JournalStore()

        #expect(!store.canLock)
        store.lock()
        #expect(!store.isLocked)
    }

    @Test func correctPasswordUnlocksAndWrongPasswordDoesNot() {
        let store = JournalStore()
        store.createJournal(password: "$Password123")
        let entry = JournalEntry(
            entryDate: "2026-08-08T12:00:00Z",
            content: "An unsaved entry",
            sentiment: "Neutral"
        )
        store.addEntry(entry)

        #expect(store.canLock)
        store.lock()
        #expect(store.isLocked)
        #expect(store.entries.count == 1)
        #expect(store.entries.first?.id == entry.id)
        #expect(store.entries.first?.content == entry.content)
        #expect(store.hasUnsavedChanges)
        #expect(!store.canAddEntry)
        #expect(!store.canLock)

        #expect(!store.unlock(with: "wrong"))
        #expect(store.isLocked)

        #expect(store.unlock(with: "$Password123"))
        #expect(!store.isLocked)
        #expect(store.entries.count == 1)
        #expect(store.entries.first?.id == entry.id)
        #expect(store.entries.first?.content == entry.content)
        #expect(store.hasUnsavedChanges)
        #expect(store.canAddEntry)
        #expect(store.canLock)
    }
}
