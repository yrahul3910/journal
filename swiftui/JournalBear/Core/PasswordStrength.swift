import Foundation

/// Password rules for new journals, mirroring the Electron app's OWASP check
/// (owasp-password-strength-test configured with minLength 8): length bounds,
/// no runs of three repeated characters, and — unless the password is long
/// enough to count as a passphrase — all four character classes.
enum PasswordStrength {
    private static let minLength = 8
    private static let maxLength = 128
    /// Passwords at least this long are treated as passphrases and skip the
    /// character-class requirements, matching the OWASP library's behavior.
    private static let minPassphraseLength = 20

    /// The first failed rule's message, or `nil` when the password is acceptable.
    static func firstError(in password: String) -> String? {
        if password.count < minLength {
            return "The password must be at least \(minLength) characters long."
        }
        if password.count > maxLength {
            return "The password must be fewer than \(maxLength) characters."
        }
        if hasRepeatedRun(password) {
            return "The password may not contain sequences of three or more repeated characters."
        }

        if password.count >= minPassphraseLength { return nil }

        if password.rangeOfCharacter(from: .lowercaseLetters) == nil {
            return "The password must contain at least one lowercase letter."
        }
        if password.rangeOfCharacter(from: .uppercaseLetters) == nil {
            return "The password must contain at least one uppercase letter."
        }
        if password.rangeOfCharacter(from: .decimalDigits) == nil {
            return "The password must contain at least one number."
        }
        if password.rangeOfCharacter(from: CharacterSet.alphanumerics.inverted) == nil {
            return "The password must contain at least one special character."
        }
        return nil
    }

    private static func hasRepeatedRun(_ password: String) -> Bool {
        var runLength = 1
        var previous: Character?
        for character in password {
            runLength = character == previous ? runLength + 1 : 1
            if runLength >= 3 { return true }
            previous = character
        }
        return false
    }
}
