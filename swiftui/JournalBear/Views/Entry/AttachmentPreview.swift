import SwiftUI
#if os(macOS)
import AppKit
#endif

/// The attachment a user tapped to enlarge, driving the iOS viewer.
struct AttachmentPreview: Identifiable {
    let index: Int
    var id: Int { index }
}

/// Telegram-style viewer for an entry's attachments. On macOS the image
/// floats alone over a screen-dimming overlay, with no window chrome; on
/// iOS it fills the screen, with swipe paging and drag-down to dismiss.
/// Clicking anywhere outside a control (or Escape, or the close button)
/// dismisses.
struct AttachmentPreviewView: View {
    @Environment(\.dismiss) private var dismiss
    let images: [Data]
    let cacheScope: String
    /// Set when hosted in the macOS overlay window; the iOS cover relies
    /// on the dismiss environment instead.
    var onDismiss: (() -> Void)?
    @State private var index: Int
#if os(iOS)
    @State private var dragOffset: CGFloat = 0
    @State private var zoomedPages: Set<Int> = []
#endif
    private let maxContentSize: CGSize
#if os(macOS)
    // The overlay window spans the whole screen, and the menu bar draws
    // over it — controls need to start below it.
    private let menuBarInset: CGFloat
#endif

    init(
        images: [Data], cacheScope: String, startAt index: Int,
        onDismiss: (() -> Void)? = nil
    ) {
        self.images = images
        self.cacheScope = cacheScope
        self.onDismiss = onDismiss
        _index = State(initialValue: index)

#if os(macOS)
        // The overlay covers the screen; the image gets most of it.
        let screen = NSScreen.main
        let visible = screen?.visibleFrame.size ?? CGSize(width: 1440, height: 800)
        maxContentSize = CGSize(
            width: visible.width * 0.92, height: visible.height * 0.92
        )
        menuBarInset = screen.map { $0.frame.maxY - $0.visibleFrame.maxY } ?? 24
#else
        maxContentSize = .zero
#endif
    }

#if os(macOS)
    var body: some View {
        ZStack {
            // The dimming effect; the hosting window itself is transparent.
            Color.black.opacity(0.82)
                .ignoresSafeArea()

            AttachmentImage(
                data: images[index],
                cacheKey: AttachmentImage.cacheKey(
                    scope: cacheScope, index: index, data: images[index]
                ),
                maxPixelSize: previewPixelSize
            )
            .frame(
                width: displaySize(at: index).width,
                height: displaySize(at: index).height
            )
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .shadow(color: .black.opacity(0.55), radius: 40, y: 12)
            .accessibilityIdentifier("attachment-preview")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .onTapGesture { close() }
        .overlay(alignment: .topTrailing) { closeButton.padding(.top, menuBarInset) }
        .overlay { chevrons }
        .overlay(alignment: .bottom) { counter }
        .background { keyboardShortcuts }
    }
#else
    var body: some View {
        ZStack {
            Color.black
                .opacity(backdropOpacity)
                .ignoresSafeArea()

            TabView(selection: $index) {
                ForEach(images.indices, id: \.self) { pageIndex in
                    AttachmentImage(
                        data: images[pageIndex],
                        cacheKey: AttachmentImage.cacheKey(
                            scope: cacheScope, index: pageIndex,
                            data: images[pageIndex]
                        ),
                        maxPixelSize: previewPixelSize,
                        enablesZoom: true,
                        accessibilityIdentifier: "attachment-preview-image-\(pageIndex)",
                        accessibilityLabel: "Attachment \(pageIndex + 1)",
                        onDismiss: close,
                        onZoomChange: { isZoomed in
                            if isZoomed {
                                zoomedPages.insert(pageIndex)
                                dragOffset = 0
                            } else {
                                zoomedPages.remove(pageIndex)
                            }
                        }
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .contentShape(Rectangle())
                    .tag(pageIndex)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea()
            .accessibilityIdentifier("attachment-preview")
            .offset(y: dragOffset)
            .simultaneousGesture(dragToDismiss)
        }
        .overlay(alignment: .topTrailing) { closeButton }
        .overlay(alignment: .bottom) { counter }
        .statusBarHidden(true)
    }

    private var backdropOpacity: Double {
        1 - min(Double(abs(dragOffset)) / 600, 0.5)
    }

    /// Telegram-style pull-away: vertical drags move the image and thin the
    /// backdrop, dismissing past a threshold. Horizontal drags stay with
    /// the pager.
    private var dragToDismiss: some Gesture {
        DragGesture()
            .onChanged { value in
                guard !zoomedPages.contains(index) else { return }
                if abs(value.translation.height) > abs(value.translation.width) {
                    dragOffset = value.translation.height
                }
            }
            .onEnded { value in
                guard !zoomedPages.contains(index) else { return }
                if abs(value.translation.height) > 120 {
                    close()
                } else {
                    withAnimation(.spring(duration: 0.3)) { dragOffset = 0 }
                }
            }
    }
#endif

    private func close() {
        if let onDismiss {
            onDismiss()
        } else {
            dismiss()
        }
    }

    // Decode at the viewer's display size in Retina pixels; a constant
    // would either waste decode time on small screens or blur on large ones.
    private var previewPixelSize: CGFloat {
#if os(macOS)
        max(maxContentSize.width, maxContentSize.height) * 2
#else
        3200
#endif
    }

    /// The image's on-screen size: aspect-fit within the screen-based box,
    /// upscaled at most 2 points per pixel — beyond that it's just blur.
    /// Exact aspect matters: the frame shows the dimmed desktop around it,
    /// so any letterboxing would read as a phantom border.
    private func displaySize(at index: Int) -> CGSize {
        guard let pixels = PlatformImage.pixelSize(of: images[index]),
              pixels.width > 0, pixels.height > 0
        else {
            return CGSize(width: 720, height: 560)
        }

        let scale = min(
            maxContentSize.width / pixels.width,
            maxContentSize.height / pixels.height,
            2
        )
        return CGSize(width: pixels.width * scale, height: pixels.height * scale)
    }

    private var closeButton: some View {
        Button {
            close()
        } label: {
            Image(systemName: "xmark")
                .font(.body.weight(.semibold))
                .foregroundStyle(.white)
                .padding(10)
                .glassEffect(in: .circle)
                // Generous invisible margin: a near-miss should still hit
                // the button, not the dismissing backdrop.
                .padding(14)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .focusEffectDisabled()
        .padding(8)
        .accessibilityLabel("Close")
        .help("Close")
    }

    @ViewBuilder
    private var chevrons: some View {
        if images.count > 1 {
            HStack {
                navButton(
                    "chevron.left", label: "Previous attachment",
                    id: "attachment-preview-previous", disabled: index == 0
                ) { index -= 1 }
                Spacer()
                navButton(
                    "chevron.right", label: "Next attachment",
                    id: "attachment-preview-next", disabled: index == images.count - 1
                ) { index += 1 }
            }
            .padding(.horizontal, 8)
        }
    }

    private func navButton(
        _ symbol: String, label: String, id: String, disabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) { action() }
        } label: {
            Image(systemName: symbol)
                .font(.title2.weight(.semibold))
                .foregroundStyle(.white)
                .padding(14)
                .glassEffect(in: .circle)
                // Same idea as the close button: a wide miss-tolerant zone.
                .padding(18)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .focusEffectDisabled()
        .disabled(disabled)
        .opacity(disabled ? 0.35 : 1)
        .accessibilityLabel(label)
        .accessibilityIdentifier(id)
    }

    @ViewBuilder
    private var counter: some View {
        if images.count > 1 {
            Text("\(index + 1) of \(images.count)")
                .font(.callout.weight(.medium))
                .foregroundStyle(.white.opacity(0.85))
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .glassCapsule()
                .padding(.bottom, 18)
                .accessibilityIdentifier("attachment-preview-counter")
        }
    }

    // The overlay window has no cancel action of its own, and bare arrow
    // keys only reach us as shortcuts, so both ride on invisible buttons.
    private var keyboardShortcuts: some View {
        Group {
            Button("Close") { close() }
                .keyboardShortcut(.cancelAction)
            if images.count > 1 {
                Button("Previous") {
                    if index > 0 {
                        withAnimation(.easeInOut(duration: 0.2)) { index -= 1 }
                    }
                }
                .keyboardShortcut(.leftArrow, modifiers: [])
                Button("Next") {
                    if index < images.count - 1 {
                        withAnimation(.easeInOut(duration: 0.2)) { index += 1 }
                    }
                }
                .keyboardShortcut(.rightArrow, modifiers: [])
            }
        }
        .opacity(0)
        .frame(width: 0, height: 0)
        .accessibilityHidden(true)
    }
}

#if os(macOS)
/// Presents the viewer in a borderless, transparent window covering the
/// screen, so the image floats over a dimming layer with no chrome at all.
/// A second SwiftUI scene would be the idiomatic route, but the mere
/// presence of one makes `fileExporter` lose its anchor window and fall
/// back to an app-modal panel (macOS 26), so the window is managed here.
@MainActor
final class AttachmentPreviewWindowController {
    static let shared = AttachmentPreviewWindowController()
    private var window: NSWindow?
    private var hosting: NSHostingController<AttachmentPreviewView>?

    func show(images: [Data], cacheScope: String, startAt index: Int) {
        close()

        let view = AttachmentPreviewView(
            images: images, cacheScope: cacheScope, startAt: index,
            onDismiss: { [weak self] in self?.close() }
        )
        let hosting = NSHostingController(rootView: view)
        // Explicit full-screen frame below; the .preferredContentSize
        // option re-enters layout mid-display-cycle and crashes.
        hosting.sizingOptions = []

        let frame = (NSScreen.main ?? NSScreen.screens.first)?.frame
            ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let window = OverlayWindow(
            contentRect: frame, styleMask: [.borderless],
            backing: .buffered, defer: false
        )
        window.contentView = hosting.view
        window.backgroundColor = .clear
        window.isOpaque = false
        window.hasShadow = false
        window.level = .floating
        window.isReleasedWhenClosed = false
        window.setFrame(frame, display: true)
        window.alphaValue = 0
        window.makeKeyAndOrderFront(nil)
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.18
            window.animator().alphaValue = 1
        }

        self.window = window
        self.hosting = hosting
    }

    func close() {
        window?.close()
        window = nil
        hosting = nil
    }
}

/// Borderless windows refuse key status by default, which would break the
/// Escape and arrow-key shortcuts inside the viewer.
private final class OverlayWindow: NSWindow {
    override var canBecomeKey: Bool { true }
}
#endif
