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

    /// Reads the pixel dimensions from the image header without decoding,
    /// accounting for EXIF rotation. Nil for undecodable data.
    static func pixelSize(of data: Data) -> CGSize? {
        let options = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, options),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, options)
                as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? CGFloat,
              let height = properties[kCGImagePropertyPixelHeight] as? CGFloat
        else {
            return nil
        }

        // Orientations 5-8 are the 90°-rotated ones, where the displayed
        // width and height swap.
        if let orientation = properties[kCGImagePropertyOrientation] as? UInt32,
           orientation >= 5 {
            return CGSize(width: height, height: width)
        }
        return CGSize(width: width, height: height)
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
