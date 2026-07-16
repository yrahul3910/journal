import SwiftUI

// The scroll view, its toolbar, and the safe-area underlap must exist from
// window creation: swapping in a different detail view after launch leaves the
// window toolbar opaque instead of the scroll edge effect. So the empty state
// is an overlay here rather than a separate detail view.
struct EntryDetail: View {
    @EnvironmentObject var store: JournalStore
    let entry: JournalEntry?

    var body: some View {
        ScrollView {
            if let entry {
                EntryContent(entry: entry)
            }
        }
        .overlay {
            if entry == nil {
                Text("Select an entry")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
        }
        .scrollEdgeEffectStyle(.soft, for: .top)
        .toolbar {
            ToolbarSpacer(.flexible)
            ToolbarItem {
                Button {
                    store.showNewEntry = .editing
                } label: {
                    Image(systemName: "pencil")
                }
                .glassEffect(in: .circle)
                .help("Edit this entry")
                .disabled(entry == nil)
            }
        }
        .toolbar(removing: .title)
#if os(macOS)
        // Part of the scroll-edge-effect recipe above; on iOS this would
        // instead push the content under the status bar.
        .ignoresSafeArea(edges: .top)
#endif
    }
}
