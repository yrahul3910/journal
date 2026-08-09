import SwiftUI

struct LockScreenView: View {
    @EnvironmentObject private var store: JournalStore
    @FocusState private var isPasswordFocused: Bool
    @State private var password = ""
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            Rectangle()
                .fill(.background)
                .ignoresSafeArea()

            VStack(spacing: 18) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 34, weight: .medium))
                    .foregroundStyle(.secondary)
                    .frame(width: 72, height: 72)
                    .glassEffect(in: .circle)

                VStack(spacing: 6) {
                    Text("Journal Locked")
                        .font(.title2.bold())
                    if let documentName = store.documentName {
                        Text(documentName)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                }

                SecureField("Journal Password", text: $password)
                    .textFieldStyle(.roundedBorder)
                    .focused($isPasswordFocused)
                    .onSubmit(unlock)
#if os(macOS)
                    .frame(width: 280)
#else
                    .frame(maxWidth: 320)
                    .textContentType(.password)
#endif

                if let errorMessage {
                    Text(errorMessage)
                        .font(.callout)
                        .foregroundStyle(.red)
                }

                Button("Unlock", action: unlock)
                    .keyboardShortcut(.defaultAction)
                    .disabled(password.isEmpty)
                    .glassButton(prominent: true)
            }
            .padding(32)
        }
        .accessibilityIdentifier("journal-lock-screen")
        .onAppear { isPasswordFocused = true }
    }

    private func unlock() {
        if store.unlock(with: password) {
            password = ""
            errorMessage = nil
        } else {
            password = ""
            errorMessage = "Incorrect password."
            isPasswordFocused = true
        }
    }
}

extension View {
    func journalLockOverlay(showsLockScreen: Bool = true) -> some View {
        modifier(JournalLockOverlay(showsLockScreen: showsLockScreen))
    }
}

private struct JournalLockOverlay: ViewModifier {
    @EnvironmentObject private var store: JournalStore
    let showsLockScreen: Bool

    func body(content: Content) -> some View {
        content
            .opacity(store.isLocked ? 0 : 1)
            .allowsHitTesting(!store.isLocked)
            .accessibilityHidden(store.isLocked)
            .overlay {
                if store.isLocked && showsLockScreen {
                    LockScreenView()
                        .environmentObject(store)
                }
            }
    }
}
