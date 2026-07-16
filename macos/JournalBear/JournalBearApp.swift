import SwiftUI
#if os(macOS)
import AppKit
#endif

@main
struct JournalBearApp: App {
#if os(macOS)
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
#endif
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var store = JournalStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
                .onAppear {
#if os(macOS)
                    appDelegate.store = store
#endif
#if DEBUG
                    store.loadUITestJournalIfConfigured()
#endif
                }
#if os(iOS)
                // iOS has no quit hook to confirm unsaved changes; save what
                // can be saved whenever the app heads to the background.
                .onChange(of: scenePhase) {
                    if scenePhase == .background { store.autosaveIfPossible() }
                }
#endif
        }
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Entry") { store.showNewEntry = .new }
                    .keyboardShortcut("n", modifiers: .command)
                    .disabled(!store.canAddEntry)
                Button("New Journal…") { store.newJournal() }
                    .keyboardShortcut("n", modifiers: [.command, .shift])
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

#if os(macOS)
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
#endif
