// Source: https://gist.github.com/joelekstrom/91dad79ebdba409556dce663d28e8297
import SwiftUI

extension View {
    /// Adds a double click handler this view (macOS). A no-op on iOS, where
    /// tapping a row already selects it and editing goes through the toolbar.
    ///
    /// Example
    /// ```
    /// Text("Hello")
    ///     .onDoubleClick { print("Double click detected") }
    /// ```
    /// - Parameters:
    ///   - handler: Block invoked when a double click is detected
    func onDoubleClick(handler: @escaping () -> Void) -> some View {
#if os(macOS)
        modifier(DoubleClickHandler(handler: handler))
#else
        self
#endif
    }
}

#if os(macOS)
struct DoubleClickHandler: ViewModifier {
    let handler: () -> Void
    func body(content: Content) -> some View {
        content.overlay {
            DoubleClickListeningViewRepresentable(handler: handler)
        }
    }
}

struct DoubleClickListeningViewRepresentable: NSViewRepresentable {
    let handler: () -> Void
    func makeNSView(context: Context) -> DoubleClickListeningView {
        DoubleClickListeningView(handler: handler)
    }
    func updateNSView(_ nsView: DoubleClickListeningView, context: Context) {}
}

class DoubleClickListeningView: NSView {
    let handler: () -> Void

    init(handler: @escaping () -> Void) {
        self.handler = handler
        super.init(frame: .zero)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func mouseDown(with event: NSEvent) {
        super.mouseDown(with: event)
        if event.clickCount == 2 {
            handler()
        }
    }
}
#endif
