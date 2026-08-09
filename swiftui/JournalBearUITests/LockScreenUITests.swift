import XCTest

final class LockScreenUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testLocksContentAndRequiresTheJournalPassword() {
        let app = XCUIApplication()
        app.launchEnvironment["JOURNALBEAR_UI_TEST_ENTRY_CONTENT"] =
            "This entry must be hidden while the journal is locked."
        app.launchEnvironment["JOURNALBEAR_UI_TEST_PASSWORD"] = "$Password123"
        app.launchClean()

        let privateEntry = app.staticTexts[
            "This entry must be hidden while the journal is locked."
        ]
        XCTAssertTrue(privateEntry.waitForExistence(timeout: 5))

#if os(macOS)
        app.typeKey("l", modifierFlags: [.command, .control])
#else
        let lockButton = app.buttons["Lock Journal"]
        XCTAssertTrue(lockButton.waitForExistence(timeout: 2))
        lockButton.activate()
#endif

        XCTAssertTrue(app.staticTexts["Journal Locked"].waitForExistence(timeout: 2))
        XCTAssertFalse(privateEntry.isHittable)

        let passwordField = app.secureTextFields["Journal Password"]
        XCTAssertTrue(passwordField.waitForExistence(timeout: 2))
        passwordField.activate()
        passwordField.typeText("wrong")
        app.buttons["Unlock"].activate()

        XCTAssertTrue(app.staticTexts["Incorrect password."].waitForExistence(timeout: 2))
        XCTAssertTrue(app.staticTexts["Journal Locked"].exists)

        passwordField.activate()
        passwordField.typeText("$Password123")
        app.buttons["Unlock"].activate()

        XCTAssertTrue(privateEntry.waitForExistence(timeout: 2))
        XCTAssertFalse(app.staticTexts["Journal Locked"].exists)
    }

    @MainActor
    func testDeviceLockNotificationLocksJournal() throws {
#if os(macOS)
        throw XCTSkip("Protected-data notifications are an iOS feature.")
#else
        let app = XCUIApplication()
        app.launchEnvironment["JOURNALBEAR_UI_TEST_ENTRY_CONTENT"] =
            "The device lock notification must hide this entry."
        app.launchEnvironment["JOURNALBEAR_UI_TEST_PASSWORD"] = "$Password123"
        app.launchEnvironment["JOURNALBEAR_UI_TEST_SIMULATE_DEVICE_LOCK"] = "1"
        app.launchClean()

        XCTAssertTrue(app.staticTexts["Journal Locked"].waitForExistence(timeout: 5))

        let passwordField = app.secureTextFields["Journal Password"]
        XCTAssertTrue(passwordField.waitForExistence(timeout: 2))
        passwordField.activate()
        passwordField.typeText("$Password123")
        app.buttons["Unlock"].activate()

        XCTAssertTrue(
            app.staticTexts["The device lock notification must hide this entry."]
                .waitForExistence(timeout: 2)
        )
#endif
    }

    @MainActor
    func testLockingPreservesAnEntryDraft() throws {
#if os(macOS)
        let app = XCUIApplication()
        app.launchEnvironment["JOURNALBEAR_UI_TEST_ENTRY_CONTENT"] = "Existing entry"
        app.launchEnvironment["JOURNALBEAR_UI_TEST_PASSWORD"] = "$Password123"
        app.launchEnvironment["JOURNALBEAR_UI_TEST_ENTRY_DRAFT"] =
            "Draft that must survive locking"
        app.launchClean()

        let existingEntry = app.staticTexts["Existing entry"]
        XCTAssertTrue(existingEntry.waitForExistence(timeout: 5))
        app.typeKey("n", modifierFlags: .command)

        let editor = app.textViews.firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout: 2))
        XCTAssertEqual(editor.value as? String, "Draft that must survive locking")

        app.typeKey("l", modifierFlags: [.command, .control])
        XCTAssertTrue(app.staticTexts["Journal Locked"].waitForExistence(timeout: 2))
        XCTAssertFalse(existingEntry.isHittable)
        XCTAssertFalse(editor.isHittable)

        let passwordField = app.secureTextFields["Journal Password"]
        passwordField.click()
        passwordField.typeText("$Password123")
        app.buttons["Unlock"].click()

        XCTAssertTrue(editor.waitForExistence(timeout: 2))
        XCTAssertEqual(editor.value as? String, "Draft that must survive locking")
#else
        throw XCTSkip("The macOS command shortcut exercises locking over a presented sheet.")
#endif
    }
}
