#if os(iOS)
import CoreGraphics
import Testing
import UIKit
@testable import JournalBear

@MainActor
struct AttachmentZoomLayoutTests {
    @Test func fitsLandscapeImageWithinPortraitViewport() {
        let size = AttachmentZoomLayout.fittedSize(
            imageSize: CGSize(width: 1600, height: 900),
            viewportSize: CGSize(width: 390, height: 844)
        )

        #expect(size.width == 390)
        #expect(size.height == 219.375)
    }

    @Test func fitsPortraitImageWithinLandscapeViewport() {
        let size = AttachmentZoomLayout.fittedSize(
            imageSize: CGSize(width: 900, height: 1600),
            viewportSize: CGSize(width: 1024, height: 768)
        )

        #expect(size.width == 432)
        #expect(size.height == 768)
    }

    @Test func zoomRectKeepsTheGestureAtItsCenter() {
        let rect = AttachmentZoomLayout.zoomRect(
            scale: 2.5,
            center: CGPoint(x: 240, y: 360),
            viewportSize: CGSize(width: 400, height: 800)
        )

        #expect(rect == CGRect(x: 160, y: 200, width: 160, height: 320))
    }

    @Test func zoomStateControlsPanningAccessibilityAndCallbacks() throws {
        var zoomChanges: [Bool] = []
        let image = try #require(UIImage(systemName: "photo"))
        let view = AttachmentZoomView(
            image: image,
            accessibilityIdentifier: nil,
            accessibilityLabel: nil,
            onDismiss: nil,
            onZoomChange: { zoomChanges.append($0) }
        )
        view.frame = CGRect(x: 0, y: 0, width: 400, height: 800)
        view.layoutIfNeeded()

        #expect(!view.isZoomed)
        #expect(!view.isPanEnabled)
        #expect(view.accessibilityZoomActionName == "Zoom In")

        view.setZoomScale(2)

        #expect(view.isZoomed)
        #expect(view.isPanEnabled)
        #expect(view.zoomScale == 2)
        #expect(view.accessibilityZoomActionName == "Zoom Out")
        #expect(zoomChanges == [true])

        view.setZoomScale(1)

        #expect(!view.isZoomed)
        #expect(!view.isPanEnabled)
        #expect(view.accessibilityZoomActionName == "Zoom In")
        #expect(zoomChanges == [true, false])
    }

    @Test func viewportChangeReturnsImageToFit() throws {
        let image = try #require(UIImage(systemName: "photo"))
        let view = AttachmentZoomView(
            image: image,
            accessibilityIdentifier: nil,
            accessibilityLabel: nil,
            onDismiss: nil,
            onZoomChange: nil
        )
        view.frame = CGRect(x: 0, y: 0, width: 400, height: 800)
        view.layoutIfNeeded()
        view.setZoomScale(3)

        view.frame = CGRect(x: 0, y: 0, width: 800, height: 400)
        view.layoutIfNeeded()

        #expect(view.zoomScale == 1)
        #expect(!view.isZoomed)
        #expect(!view.isPanEnabled)
    }
}
#endif
