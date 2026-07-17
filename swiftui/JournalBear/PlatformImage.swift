import SwiftUI
#if os(macOS)
import AppKit

typealias PlatformImage = NSImage
#else
import UIKit

typealias PlatformImage = UIImage
#endif

extension Image {
    init(platformImage: PlatformImage) {
#if os(macOS)
        self.init(nsImage: platformImage)
#else
        self.init(uiImage: platformImage)
#endif
    }
}
