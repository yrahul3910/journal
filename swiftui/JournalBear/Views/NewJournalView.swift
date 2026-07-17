import SwiftUI

/// Collect and confirm a password for a brand-new journal. On create, the
/// store replaces its state with an empty in-memory journal (see
/// `JournalStore.createJournal`); nothing touches disk until the first
/// Save (⌘S) asks for a location.
struct NewJournalView: View {
    @EnvironmentObject var store: JournalStore
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "book.closed.fill")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("Create New Journal")
                .font(.headline)
            Text("Enter a secure password to encrypt your journal.")
                .font(.callout)
                .foregroundStyle(.secondary)

            VStack(spacing: 10) {
                SecureField("Password", text: $password)
                    .textFieldStyle(.roundedBorder)
                SecureField("Confirm Password", text: $confirmPassword)
                    .textFieldStyle(.roundedBorder)
            }
#if os(macOS)
            .frame(width: 260)
#endif
            .onSubmit(create)

            if let errorMessage {
                Text(errorMessage)
                    .font(.callout)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
#if os(macOS)
                    .frame(width: 280)
#endif
            }

            HStack {
                Button("Cancel", role: .cancel) { store.showNewJournalPrompt = false }
                    .glassButton()
                Button("Create") { create() }
                    .keyboardShortcut(.defaultAction)
                    .disabled(password.isEmpty || confirmPassword.isEmpty)
                    .glassButton(prominent: true)
            }
        }
        .padding(28)
#if os(macOS)
        .frame(width: 340)
#else
        .presentationDetents([.medium])
#endif
    }

    private func create() {
        guard password == confirmPassword else {
            errorMessage = "Passwords do not match."
            return
        }
        if let strengthError = PasswordStrength.firstError(in: password) {
            errorMessage = strengthError
            return
        }
        store.createJournal(password: password)
    }
}
