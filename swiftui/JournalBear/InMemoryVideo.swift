import AVFoundation
import UniformTypeIdentifiers

/// A video attachment that AVFoundation plays straight from memory.
///
/// `AVPlayer` only plays URLs, and writing a decrypted video to a temporary
/// file would leave journal content on disk in plaintext. So `asset` points at
/// a made-up URL scheme, and this object answers the asset's resource loader
/// with byte ranges of `data`. The loader holds its delegate weakly: keep this
/// object alive for as long as `asset` (or a player built from it) is in use.
final class InMemoryVideo: NSObject, AVAssetResourceLoaderDelegate {
    let asset: AVURLAsset
    private let data: Data

    // AVFoundation consults the resource loader only for URL schemes it can't
    // load itself, hence the custom scheme. The literal always parses.
    private static let url = URL(string: "journalbear-memory://attachment.mp4")!
    private static let loaderQueue = DispatchQueue(label: "com.yrahul.JournalBear.in-memory-video")

    init(data: Data) {
        self.data = data
        asset = AVURLAsset(url: Self.url)
        super.init()
        asset.resourceLoader.setDelegate(self, queue: Self.loaderQueue)
    }

    /// The width-to-height ratio the video displays at, with its rotation
    /// applied (phone videos are often stored landscape and rotated to
    /// portrait). Nil when the bytes hold no readable video track.
    func displayAspectRatio() async -> CGFloat? {
        guard let track = try? await asset.loadTracks(withMediaType: .video).first,
              let size = try? await track.load(.naturalSize),
              let transform = try? await track.load(.preferredTransform)
        else {
            return nil
        }

        let displayed = CGRect(origin: .zero, size: size).applying(transform)
        return displayed.height > 0 ? displayed.width / displayed.height : nil
    }

    func resourceLoader(
        _ resourceLoader: AVAssetResourceLoader,
        shouldWaitForLoadingOfRequestedResource loadingRequest: AVAssetResourceLoadingRequest
    ) -> Bool {
        if let info = loadingRequest.contentInformationRequest {
            // Archived videos are MP4 or MOV; AVFoundation reads either as MPEG-4.
            info.contentType = UTType.mpeg4Movie.identifier
            info.contentLength = Int64(data.count)
            info.isByteRangeAccessSupported = true
        }

        if let request = loadingRequest.dataRequest {
            let start = min(Int(request.requestedOffset), data.count)
            let end = request.requestsAllDataToEndOfResource
                ? data.count
                : min(start + request.requestedLength, data.count)
            request.respond(with: data[(data.startIndex + start)..<(data.startIndex + end)])
        }

        loadingRequest.finishLoading()
        return true
    }
}
