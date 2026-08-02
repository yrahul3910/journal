import ImageIO
import SwiftUI
#if os(macOS)
import AppKit

typealias PlatformImage = NSImage
#else
import UIKit

typealias PlatformImage = UIImage
#endif

extension PlatformImage {
    /// Decodes image bytes scaled to at most `maxPixelSize` on the long edge
    /// (small images keep their size; nil for undecodable data). Camera photos
    /// otherwise decode at full resolution, which is far more work than their
    /// on-screen size ever needs.
    static func downsampled(from data: Data, maxPixelSize: CGFloat) -> PlatformImage? {
        guard let cgImage = downsampledCGImage(from: data, maxPixelSize: maxPixelSize) else {
            return nil
        }

#if os(macOS)
        return NSImage(cgImage: cgImage, size: NSSize(width: cgImage.width, height: cgImage.height))
#else
        return UIImage(cgImage: cgImage)
#endif
    }

    static func downsampledCGImage(from data: Data, maxPixelSize: CGFloat) -> CGImage? {
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions) else {
            return nil
        }

        let thumbnailOptions = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
        ] as [CFString: Any] as CFDictionary

        return CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions)
    }
}

extension Image {
    init(platformImage: PlatformImage) {
#if os(macOS)
        self.init(nsImage: platformImage)
#else
        self.init(uiImage: platformImage)
#endif
    }
}
