import XCTest

/// Opening a format 7.1 journal through the unlock flow, with the right
/// password and with a wrong one.
final class JournalFormatUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func launch(withPassword password: String) -> XCUIApplication {
        let fixtureURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("JournalBearTests/Fixtures/test_journal_7.1.zjournal")
        XCTAssertTrue(FileManager.default.fileExists(atPath: fixtureURL.path))

        let app = XCUIApplication()
        app.launchEnvironment["JOURNALBEAR_UI_TEST_JOURNAL"] = fixtureURL.path
        app.launchEnvironment["JOURNALBEAR_UI_TEST_PASSWORD"] = password
        app.launchClean()
        return app
    }

    @MainActor
    func testOpensA71JournalAndListsItsEntries() throws {
        let app = launch(withPassword: "$Password123")

        let entry = app.staticTexts.matching(
            NSPredicate(
                format: "label CONTAINS %@ OR value CONTAINS %@",
                "second entry on June 16", "second entry on June 16"
            )
        ).firstMatch
        XCTAssertTrue(entry.waitForExistence(timeout: 10))
    }

    @MainActor
    func testReportsAWrongPasswordForA71Journal() throws {
        let app = launch(withPassword: "definitely-the-wrong-password")

        XCTAssertTrue(app.staticTexts["Couldn't Open Journal"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Wrong password."].exists)
    }
}
