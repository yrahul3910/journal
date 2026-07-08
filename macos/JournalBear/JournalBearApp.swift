import SwiftUI
import AppKit

@main
struct JournalBearApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var store = JournalStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
                .onAppear { appDelegate.store = store }
        }
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Entry") { store.showNewEntry = .new }
                    .keyboardShortcut("n", modifiers: .command)
                    .disabled(!store.canAddEntry)
                Divider()
                Button("Open Journal…") { store.chooseFile() }
                    .keyboardShortcut("o", modifiers: .command)
            }
            CommandGroup(replacing: .saveItem) {
                Button("Save") { store.save() }
                    .keyboardShortcut("s", modifiers: .command)
                    .disabled(!store.hasUnsavedChanges)
            }
        }
    }
}

/// Bridges AppKit's terminate flow so we can confirm before quitting with
/// unsaved changes since SwiftUI's `WindowGroup` has no built-in save/dirty model.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    weak var store: JournalStore?

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool {
        true
    }

    func applicationShouldTerminate(
        _ app: NSApplication
    ) -> NSApplication.TerminateReply {
        guard let store, store.hasUnsavedChanges else { return .terminateNow }

        let alert = NSAlert()
        alert.messageText = "Save changes before quitting?"
        alert.informativeText =
            "Your journal has unsaved changes. If you don't save, they will be lost."
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Discard")
        alert.addButton(withTitle: "Cancel")

        switch alert.runModal() {
        case .alertFirstButtonReturn: // Save
            store.save { success in
                NSApp.reply(toApplicationShouldTerminate: success)
            }
            return .terminateLater
        case .alertSecondButtonReturn: // Discard
            return .terminateNow
        default: // Cancel
            return .terminateCancel
        }
    }
}
