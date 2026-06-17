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
            // Replace "New" with "Open Journal…" for this milestone (open-only).
            CommandGroup(replacing: .newItem) {
                Button("Open Journal…") { store.chooseFile() }
                    .keyboardShortcut("o", modifiers: .command)
            }
        }
    }
}
