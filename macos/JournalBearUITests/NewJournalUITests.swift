import XCTest

final class NewJournalUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// Creates an empty in-memory journal, filling both password fields.
    private func createJournal(in app: XCUIApplication) {
        app.startNewJournal()

        let passwordField = app.secureTextFields["Password"]
        XCTAssertTrue(passwordField.waitForExistence(timeout: 2))
        passwordField.activate()
        passwordField.typeText("$Password123")

        let confirmField = app.secureTextFields["Confirm Password"]
        confirmField.activate()
        confirmField.typeText("$Password123")

        app.buttons["Create"].activate()
    }

    @MainActor
    func testCreatesEmptyJournalFromShortcut() throws {
        let app = XCUIApplication()
        app.launchClean()

        XCTAssertTrue(app.staticTexts["No Journal Open"].waitForExistence(timeout: 5))

        createJournal(in: app)

        // The new journal is open and empty; entries can now be added.
        XCTAssertTrue(app.staticTexts["No Entries"].waitForExistence(timeout: 2))
    }

    @MainActor
    func testNewJournalOverUnsavedChangesAsksFirst() throws {
        let app = XCUIApplication()
        app.launchClean()

        XCTAssertTrue(app.staticTexts["No Journal Open"].waitForExistence(timeout: 5))

        // A freshly created journal is dirty until its first save.
        createJournal(in: app)
        XCTAssertTrue(app.staticTexts["No Entries"].waitForExistence(timeout: 2))

        // Requesting another new journal must ask about the unsaved changes.
        app.startNewJournal()
        let prompt = app.staticTexts["Save changes before creating a new journal?"]
        XCTAssertTrue(prompt.waitForExistence(timeout: 2))

        // Cancel keeps the dirty journal open without showing the create sheet.
        app.confirmationButton("Cancel").activate()
        XCTAssertTrue(app.staticTexts["No Entries"].waitForExistence(timeout: 2))
        XCTAssertFalse(app.secureTextFields["Password"].exists)

        // Discard proceeds to the create sheet.
        app.startNewJournal()
        XCTAssertTrue(prompt.waitForExistence(timeout: 2))
        app.confirmationButton("Discard").activate()
        XCTAssertTrue(app.secureTextFields["Password"].waitForExistence(timeout: 2))
    }

    @MainActor
    func testOpeningAnotherJournalOverUnsavedChangesAsksFirst() throws {
        let app = XCUIApplication()
        app.launchClean()

        XCTAssertTrue(app.staticTexts["No Journal Open"].waitForExistence(timeout: 5))
        createJournal(in: app)
        XCTAssertTrue(app.staticTexts["No Entries"].waitForExistence(timeout: 2))

        // Opening another journal over the dirty one must ask first.
        app.startOpenJournal()
        let prompt = app.staticTexts["Save changes before opening another journal?"]
        XCTAssertTrue(prompt.waitForExistence(timeout: 2))

        // Cancel keeps the dirty journal open without any file picker.
        app.confirmationButton("Cancel").activate()
        XCTAssertTrue(app.staticTexts["No Entries"].waitForExistence(timeout: 2))

#if os(macOS)
        // Discard proceeds to the open panel.
        app.startOpenJournal()
        XCTAssertTrue(prompt.waitForExistence(timeout: 2))
        app.confirmationButton("Discard").activate()
        let cancel = app.sheets.buttons["Cancel"].firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 5))
        cancel.click()
        XCTAssertTrue(app.staticTexts["No Entries"].waitForExistence(timeout: 2))
#endif
    }

    @MainActor
    func testRejectsWeakPassword() throws {
        let app = XCUIApplication()
        app.launchClean()

        XCTAssertTrue(app.staticTexts["No Journal Open"].waitForExistence(timeout: 5))

        app.startNewJournal()

        let passwordField = app.secureTextFields["Password"]
        XCTAssertTrue(passwordField.waitForExistence(timeout: 2))
        passwordField.activate()
        passwordField.typeText("weak1234")

        let confirmField = app.secureTextFields["Confirm Password"]
        confirmField.activate()
        confirmField.typeText("weak1234")

        app.buttons["Create"].activate()

        let error = app.staticTexts[
            "The password must contain at least one uppercase letter."
        ]
        XCTAssertTrue(error.waitForExistence(timeout: 2))
        // Still in the sheet; no journal was created.
        XCTAssertTrue(app.secureTextFields["Password"].exists)
    }
}
