import AVKit
import SwiftUI

/// Plays one video attachment inline with the system playback controls,
/// sized to the video's own aspect ratio.
struct AttachmentVideo: View {
    @EnvironmentObject private var store: JournalStore
    let data: Data

    @State private var video: InMemoryVideo?
    @State private var player: AVPlayer?
    @State private var aspectRatio: CGFloat = 16 / 9

    var body: some View {
        VideoPlayer(player: player)
            .aspectRatio(aspectRatio, contentMode: .fit)
            // Locking only hides the journal, and a paused player could still
            // be resumed with the media keys or Now Playing, so the player is
            // torn down while locked and rebuilt on unlock.
            .task(id: store.isLocked) {
                guard !store.isLocked else {
                    player = nil
                    video = nil
                    return
                }
                guard video == nil else { return }

                let video = InMemoryVideo(data: data)
                self.video = video
                player = AVPlayer(playerItem: AVPlayerItem(asset: video.asset))
                aspectRatio = await video.displayAspectRatio() ?? aspectRatio
            }
            .onDisappear { player?.pause() }
    }
}
