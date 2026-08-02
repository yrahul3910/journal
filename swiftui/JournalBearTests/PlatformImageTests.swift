import CoreGraphics
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers
@testable import JournalBear

struct PlatformImageTests {
    /// Encodes a solid-color PNG of the given pixel size.
    private func pngData(width: Int, height: Int) throws -> Data {
        let context = try #require(CGContext(
            data: nil, width: width, height: height,
            bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ))
        context.setFillColor(CGColor(red: 0.2, green: 0.5, blue: 0.8, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let image = try #require(context.makeImage())

        let out = NSMutableData()
        let destination = try #require(CGImageDestinationCreateWithData(
            out, UTType.png.identifier as CFString, 1, nil
        ))
        CGImageDestinationAddImage(destination, image, nil)
        #expect(CGImageDestinationFinalize(destination))
        return out as Data
    }

    // Pixel assertions use the CGImage; NSImage's snapshot rep reports pixel
    // sizes at the current screen scale, so it isn't a stable measure.
    @Test func downsampledCapsTheLongEdgeAndKeepsAspect() throws {
        let data = try pngData(width: 1000, height: 500)
        let image = try #require(PlatformImage.downsampledCGImage(from: data, maxPixelSize: 200))
        #expect(image.width == 200)
        #expect(image.height == 100)
    }

    @Test func downsampledKeepsImagesAlreadyUnderTheCap() throws {
        let data = try pngData(width: 120, height: 80)
        let image = try #require(PlatformImage.downsampledCGImage(from: data, maxPixelSize: 200))
        #expect(image.width == 120)
        #expect(image.height == 80)
    }

    @Test func downsampledWrapsThePlatformImage() throws {
        let data = try pngData(width: 300, height: 300)
        #expect(PlatformImage.downsampled(from: data, maxPixelSize: 200) != nil)
    }

    @Test func downsampledReturnsNilForNonImageData() {
        #expect(PlatformImage.downsampled(from: Data([0, 1, 2, 3]), maxPixelSize: 200) == nil)
        #expect(PlatformImage.downsampled(from: Data(), maxPixelSize: 200) == nil)
    }
}
