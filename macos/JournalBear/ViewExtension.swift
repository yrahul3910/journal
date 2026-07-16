import SwiftUI

public extension View {
    /// A Liquid Glass capsule background on macOS/iOS 26+, falling back to a
    /// material capsule below. The app targets the 26 SDKs, so the fallback
    /// only matters if the deployment target is ever lowered.
    @ViewBuilder
    func glassCapsule() -> some View {
        if #available(macOS 26.0, iOS 26.0, *) {
            self.glassEffect()
        } else {
            self
                .background(.regularMaterial, in: Capsule())
                .overlay(Capsule().stroke(.quaternary))
        }
    }

    /// The Liquid Glass button style on macOS/iOS 26+, falling back to the
    /// default button style below. Pass `prominent` for primary/default actions.
    @ViewBuilder
    func glassButton(prominent: Bool = false) -> some View {
        if #available(macOS 26.0, iOS 26.0, *) {
            if prominent {
                self.buttonStyle(.glassProminent)
            } else {
                self.buttonStyle(.glass)
            }
        } else {
            self
        }
    }
}
