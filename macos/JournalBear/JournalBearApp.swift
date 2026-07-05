import SwiftUI

@main
struct JournalBearApp: App {
    @StateObject private var store = JournalStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
        }
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Entry") { store.showNewEntry = true }
                    .keyboardShortcut("n", modifiers: .command)
                    .disabled(!store.canAddEntry)
                Divider()
                Button("Open Journal…") { store.chooseFile() }
                    .keyboardShortcut("o", modifiers: .command)
            }
        }
    }
}
