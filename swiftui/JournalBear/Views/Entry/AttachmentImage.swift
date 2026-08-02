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
    // shows its attachments without a placeholder flash.
    private static let cache: NSCache<NSString, PlatformImage> = {
        let cache = NSCache<NSString, PlatformImage>()
        cache.countLimit = 60
        return cache
    }()

    /// Key for the decode cache and the view's task identity. Includes the
    /// data's size and a prefix hash so replacing an image at the same
    /// position (editing an entry, removing an editor thumbnail) doesn't
    /// serve the stale decode.
    static func cacheKey(scope: String, index: Int, data: Data) -> String {
        "\(scope)-\(index)-\(data.count)-\(data.prefix(128).hashValue)"
    }

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
        .task(id: cacheKey) {
            if let cached = Self.cache.object(forKey: cacheKey as NSString) {
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
                Self.cache.setObject(decoded, forKey: cacheKey as NSString)
                image = decoded
            } else {
                failed = true
            }
        }
    }
}
