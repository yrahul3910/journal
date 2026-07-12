import XCTest

final class NewJournalUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testCreatesEmptyJournalFromShortcut() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.staticTexts["No Journal Open"].waitForExistence(timeout: 5))

        app.typeKey("n", modifierFlags: [.command, .shift])

        let passwordField = app.secureTextFields["Password"]
        XCTAssertTrue(passwordField.waitForExistence(timeout: 2))
        passwordField.click()
        passwordField.typeText("$Password123")

        let confirmField = app.secureTextFields["Confirm Password"]
        confirmField.click()
        confirmField.typeText("$Password123")

        app.buttons["Create"].click()

        // The new journal is open and empty; entries can now be added.
        XCTAssertTrue(app.staticTexts["No Entries"].waitForExistence(timeout: 2))
    }

    @MainActor
    func testRejectsWeakPassword() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.staticTexts["No Journal Open"].waitForExistence(timeout: 5))

        app.typeKey("n", modifierFlags: [.command, .shift])

        let passwordField = app.secureTextFields["Password"]
        XCTAssertTrue(passwordField.waitForExistence(timeout: 2))
        passwordField.click()
        passwordField.typeText("weak1234")

        let confirmField = app.secureTextFields["Confirm Password"]
        confirmField.click()
        confirmField.typeText("weak1234")

        app.buttons["Create"].click()

        let error = app.staticTexts[
            "The password must contain at least one uppercase letter."
        ]
        XCTAssertTrue(error.waitForExistence(timeout: 2))
        // Still in the sheet; no journal was created.
        XCTAssertTrue(app.secureTextFields["Password"].exists)
    }
}
