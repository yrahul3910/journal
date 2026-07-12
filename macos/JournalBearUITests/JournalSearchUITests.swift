import XCTest

final class JournalSearchUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testReturnSubmitsSearchWithoutFilters() throws {
        let fixtureURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("test_journal.zjournal")
        XCTAssertTrue(FileManager.default.fileExists(atPath: fixtureURL.path))

        let app = XCUIApplication()
        app.launchEnvironment["JOURNALBEAR_UI_TEST_JOURNAL"] = fixtureURL.path
        app.launchEnvironment["JOURNALBEAR_UI_TEST_PASSWORD"] = "$Password123"
        app.launch()

        let matchingEntry = app.staticTexts[
            "This is a second entry on June 16. It has two images attached."
        ]
        let nonmatchingContent =
            "An entry on June 15.\n\n" +
            "This has two paragraphs.:smile: \u{1F602} with a : smile : and a Unicode emoji.\n\n" +
            "This has a \"Sad\" emotion."
        let nonmatchingEntry = app.staticTexts[nonmatchingContent]
        XCTAssertTrue(matchingEntry.waitForExistence(timeout: 5))
        XCTAssertTrue(nonmatchingEntry.exists)

        let searchField = app.searchFields.firstMatch
        XCTAssertTrue(searchField.waitForExistence(timeout: 2))
        let resultCount = app.staticTexts["search-result-count"]
        searchField.click()
        searchField.typeText("second entry")
        XCTAssertTrue(nonmatchingEntry.exists)
        XCTAssertFalse(resultCount.exists)

        searchField.typeKey(.return, modifierFlags: [])

        XCTAssertTrue(resultCount.waitForExistence(timeout: 2))
        XCTAssertTrue(matchingEntry.exists)
        XCTAssertFalse(nonmatchingEntry.exists)
    }
}
