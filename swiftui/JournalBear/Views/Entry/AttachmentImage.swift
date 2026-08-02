import CryptoKit
import SwiftUI

/// Renders one attachment's image bytes, decoding off the main thread at a
/// bounded pixel size. Decoding inline in `body` (`PlatformImage(data:)`)
/// stalls the main thread with a full-resolution decode of every photo each
/// time the view updates, which made selecting an entry visibly lag on macOS.
struct AttachmentImage: View {
    let data: Data
    let cacheKey: String
    var maxPixelSize: CGFloat = 1600
    var contentMode: ContentMode = .fit

    @State private var image: PlatformImage?
    @State private var failed = false

    // Decoded images for recently viewed entries, so re-selecting an entry
    // shows its attachments without a placeholder flash. Cost-bounded since
    // preview-sized decodes of photo libraries add up quickly.
    private static let cache: NSCache<NSString, PlatformImage> = {
        let cache = NSCache<NSString, PlatformImage>()
        cache.countLimit = 60
        cache.totalCostLimit = 256 * 1024 * 1024
        return cache
    }()

    /// Key for the decode cache and the view's task identity. Includes the
    /// data's size and a digest of both ends of the bytes so replacing an
    /// image at the same position (editing an entry, removing an editor
    /// thumbnail) doesn't serve the stale decode. Distinct photos from the
    /// same camera share their header bytes, so a prefix alone can collide;
    /// their trailing compressed bytes and exact length don't. Hashing is
    /// capped rather than full-content because this runs in `body` on the
    /// main thread — the very stall this view exists to avoid.
    static func cacheKey(scope: String, index: Int, data: Data) -> String {
        var hasher = SHA256()
        hasher.update(data: data.prefix(hashSampleBytes))
        hasher.update(data: data.suffix(hashSampleBytes))
        let digest = hasher.finalize().prefix(8)
            .map { String(format: "%02x", $0) }
            .joined()
        return "\(scope)-\(index)-\(data.count)-\(digest)"
    }

    private static let hashSampleBytes = 64 * 1024

    // The same bytes can be decoded at different sizes (entry detail vs. the
    // enlarged preview), so the pixel cap is part of the cache identity.
    private var decodeKey: String { "\(cacheKey)-\(Int(maxPixelSize))" }

    var body: some View {
        Group {
            if let image {
                Image(platformImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            } else if !failed {
                RoundedRectangle(cornerRadius: 10)
                    .fill(.quaternary)
                    .overlay { ProgressView() }
            }
        }
        .task(id: decodeKey) {
            if let cached = Self.cache.object(forKey: decodeKey as NSString) {
                image = cached
                return
            }

            image = nil
            failed = false

            let decoded = await Task.detached(priority: .userInitiated) {
                [data, maxPixelSize] in
                PlatformImage.downsampled(from: data, maxPixelSize: maxPixelSize)
            }.value

            if let decoded {
                let cost = Int(decoded.size.width * decoded.size.height) * 4
                Self.cache.setObject(decoded, forKey: decodeKey as NSString, cost: cost)
                image = decoded
            } else {
                failed = true
            }
        }
    }
}
