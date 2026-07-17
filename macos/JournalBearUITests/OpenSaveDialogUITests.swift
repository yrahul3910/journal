import XCTest

/// Smoke tests for the file open/save dialogs (`fileImporter`/`fileExporter`).
/// These only assert the panels present and cancel cleanly; the read/write
/// logic itself is covered by round-trip tests in JournalBearTests.
final class OpenSaveDialogUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testOpenJournalPresentsFilePicker() throws {
#if !os(macOS)
        throw XCTSkip("The iOS pickers are out-of-process; only the macOS panels are driven here.")
#else
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.staticTexts["No Journal Open"].waitForExistence(timeout: 5))
        app.buttons["Open Journal..."].click()

        let cancel = app.sheets.buttons["Cancel"].firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 5))
        cancel.click()

        XCTAssertTrue(app.staticTexts["No Journal Open"].waitForExistence(timeout: 2))
#endif
    }

    @MainActor
    func testSavingNewJournalPresentsLocationPickerAndSurvivesCancel() throws {
#if !os(macOS)
        throw XCTSkip("The iOS pickers are out-of-process; only the macOS panels are driven here.")
#else
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

        XCTAssertTrue(app.staticTexts["No Entries"].waitForExistence(timeout: 2))

        // A journal created in-app has no file yet, so Save asks for a location.
        app.typeKey("s", modifierFlags: .command)
        let cancel = app.sheets.buttons["Cancel"].firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 5))
        cancel.click()

        // Cancelling leaves the journal open and dirty; Save asks again.
        XCTAssertTrue(app.staticTexts["No Entries"].waitForExistence(timeout: 2))
        app.typeKey("s", modifierFlags: .command)
        XCTAssertTrue(cancel.waitForExistence(timeout: 5))
        cancel.click()
        XCTAssertTrue(app.staticTexts["No Entries"].waitForExistence(timeout: 2))
#endif
    }
}
