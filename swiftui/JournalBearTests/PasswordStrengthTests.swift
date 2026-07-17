import Testing
@testable import JournalBear

/// Rules mirror the Electron app's OWASP configuration (minLength 8); see
/// `PasswordStrength` for the full list.
struct PasswordStrengthTests {
    @Test func acceptsStrongPassword() {
        #expect(PasswordStrength.firstError(in: "$Password123") == nil)
    }

    @Test func rejectsShortPassword() {
        #expect(PasswordStrength.firstError(in: "$Pass12") != nil)
    }

    @Test func rejectsOverlongPassword() {
        let long = "$Aa1" + String(repeating: "x1$B", count: 32)
        #expect(PasswordStrength.firstError(in: long) != nil)
    }

    @Test func rejectsRunsOfRepeatedCharacters() {
        #expect(PasswordStrength.firstError(in: "$Passsword123") != nil)
    }

    @Test(arguments: [
        "password123$",  // no uppercase
        "PASSWORD123$",  // no lowercase
        "$Passwordabc",  // no number
        "Password1234",  // no special character
    ])
    func rejectsMissingCharacterClass(_ password: String) {
        #expect(PasswordStrength.firstError(in: password) != nil)
    }

    @Test func allowsLongPassphraseWithoutCharacterClasses() {
        #expect(PasswordStrength.firstError(in: "correct horse battery staple") == nil)
    }
}
