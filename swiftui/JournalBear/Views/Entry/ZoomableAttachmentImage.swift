#if os(iOS)
import SwiftUI
import UIKit

struct ZoomableAttachmentImage: UIViewRepresentable {
    let image: UIImage
    let accessibilityIdentifier: String?
    let accessibilityLabel: String?
    let onDismiss: (() -> Void)?
    let onZoomChange: ((Bool) -> Void)?

    func makeUIView(context: Context) -> AttachmentZoomView {
        AttachmentZoomView(
            image: image,
            accessibilityIdentifier: accessibilityIdentifier,
            accessibilityLabel: accessibilityLabel,
            onDismiss: onDismiss,
            onZoomChange: onZoomChange
        )
    }

    func updateUIView(_ view: AttachmentZoomView, context: Context) {
        view.update(
            image: image,
            accessibilityIdentifier: accessibilityIdentifier,
            accessibilityLabel: accessibilityLabel,
            onDismiss: onDismiss,
            onZoomChange: onZoomChange
        )
    }
}

final class AttachmentZoomView: UIView, UIScrollViewDelegate {
    private let scrollView = UIScrollView()
    private let imageView = UIImageView()
    private var image: UIImage
    private var viewportSize = CGSize.zero
    private var onDismiss: (() -> Void)?
    private var onZoomChange: ((Bool) -> Void)?
    private(set) var isZoomed = false
    var zoomScale: CGFloat { scrollView.zoomScale }
    var isPanEnabled: Bool { scrollView.panGestureRecognizer.isEnabled }
    var accessibilityZoomActionName: String? {
        imageView.accessibilityCustomActions?.first?.name
    }

    init(
        image: UIImage,
        accessibilityIdentifier: String?,
        accessibilityLabel: String?,
        onDismiss: (() -> Void)?,
        onZoomChange: ((Bool) -> Void)?
    ) {
        self.image = image
        self.onDismiss = onDismiss
        self.onZoomChange = onZoomChange
        super.init(frame: .zero)

        scrollView.delegate = self
        scrollView.minimumZoomScale = 1
        scrollView.maximumZoomScale = 4
        scrollView.showsHorizontalScrollIndicator = false
        scrollView.showsVerticalScrollIndicator = false
        scrollView.bouncesZoom = true
        scrollView.contentInsetAdjustmentBehavior = .never
        scrollView.panGestureRecognizer.isEnabled = false
        addSubview(scrollView)

        imageView.image = image
        imageView.contentMode = .scaleAspectFit
        imageView.isAccessibilityElement = true
        imageView.accessibilityIdentifier = accessibilityIdentifier
        imageView.accessibilityLabel = accessibilityLabel
        imageView.accessibilityValue = "Fit to screen"
        imageView.accessibilityTraits = .image
        scrollView.addSubview(imageView)

        let singleTap = UITapGestureRecognizer(target: self, action: #selector(didSingleTap))
        let doubleTap = UITapGestureRecognizer(target: self, action: #selector(didDoubleTap(_:)))
        doubleTap.numberOfTapsRequired = 2
        singleTap.require(toFail: doubleTap)
        scrollView.addGestureRecognizer(singleTap)
        scrollView.addGestureRecognizer(doubleTap)

        isAccessibilityElement = false
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func update(
        image: UIImage,
        accessibilityIdentifier: String?,
        accessibilityLabel: String?,
        onDismiss: (() -> Void)?,
        onZoomChange: ((Bool) -> Void)?
    ) {
        imageView.accessibilityIdentifier = accessibilityIdentifier
        imageView.accessibilityLabel = accessibilityLabel
        self.onDismiss = onDismiss
        self.onZoomChange = onZoomChange

        guard self.image !== image else { return }
        self.image = image
        imageView.image = image
        viewportSize = .zero
        setNeedsLayout()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        scrollView.frame = bounds

        guard bounds.size != viewportSize, bounds.width > 0, bounds.height > 0 else {
            return
        }

        viewportSize = bounds.size
        scrollView.setZoomScale(scrollView.minimumZoomScale, animated: false)
        imageView.frame = CGRect(
            origin: .zero,
            size: AttachmentZoomLayout.fittedSize(
                imageSize: image.size,
                viewportSize: bounds.size
            )
        )
        scrollView.contentSize = imageView.bounds.size
        centerImage()
        updateZoomState()
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? {
        imageView
    }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        centerImage()
        updateZoomState()
    }

    func setZoomScale(_ scale: CGFloat, animated: Bool = false) {
        scrollView.setZoomScale(scale, animated: animated)
    }

    @objc private func didSingleTap() {
        onDismiss?()
    }

    @objc private func didDoubleTap(_ gesture: UITapGestureRecognizer) {
        if isZoomed {
            zoomOut()
            return
        }

        zoomIn(at: gesture.location(in: imageView))
    }

    private func zoomIn(at location: CGPoint) {
        scrollView.zoom(
            to: AttachmentZoomLayout.zoomRect(
                scale: min(2.5, scrollView.maximumZoomScale),
                center: location,
                viewportSize: scrollView.bounds.size
            ),
            animated: true
        )
    }

    private func zoomOut() {
        scrollView.setZoomScale(scrollView.minimumZoomScale, animated: true)
    }

    private func centerImage() {
        let horizontal = max((scrollView.bounds.width - scrollView.contentSize.width) / 2, 0)
        let vertical = max((scrollView.bounds.height - scrollView.contentSize.height) / 2, 0)
        scrollView.contentInset = UIEdgeInsets(
            top: vertical,
            left: horizontal,
            bottom: vertical,
            right: horizontal
        )
    }

    private func updateZoomState() {
        let nextIsZoomed = scrollView.zoomScale > scrollView.minimumZoomScale + 0.01
        scrollView.panGestureRecognizer.isEnabled = nextIsZoomed
        imageView.accessibilityValue = nextIsZoomed ? "Zoomed" : "Fit to screen"
        imageView.accessibilityCustomActions = [
            UIAccessibilityCustomAction(
                name: nextIsZoomed ? "Zoom Out" : "Zoom In"
            ) { [weak self] _ in
                guard let self else { return false }

                if self.isZoomed {
                    self.zoomOut()
                } else {
                    self.zoomIn(at: CGPoint(
                        x: self.imageView.bounds.midX,
                        y: self.imageView.bounds.midY
                    ))
                }
                return true
            }
        ]

        guard nextIsZoomed != isZoomed else { return }
        isZoomed = nextIsZoomed
        onZoomChange?(nextIsZoomed)
    }
}

enum AttachmentZoomLayout {
    static func fittedSize(imageSize: CGSize, viewportSize: CGSize) -> CGSize {
        guard imageSize.width > 0, imageSize.height > 0 else { return .zero }

        let scale = min(
            viewportSize.width / imageSize.width,
            viewportSize.height / imageSize.height
        )
        return CGSize(width: imageSize.width * scale, height: imageSize.height * scale)
    }

    static func zoomRect(scale: CGFloat, center: CGPoint, viewportSize: CGSize) -> CGRect {
        let size = CGSize(width: viewportSize.width / scale, height: viewportSize.height / scale)
        return CGRect(
            x: center.x - size.width / 2,
            y: center.y - size.height / 2,
            width: size.width,
            height: size.height
        )
    }
}
#endif
