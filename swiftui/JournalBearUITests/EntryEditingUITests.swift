import XCTest

final class EntryEditingUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testEditToolbarButtonOpensTheEntryEditor() throws {
#if os(macOS)
        throw XCTSkip("Covers the native iOS toolbar button treatment.")
#else
        let app = XCUIApplication()
        app.launchEnvironment["JOURNALBEAR_UI_TEST_ENTRY_CONTENT"] = "Entry ready to edit"
        app.launchClean()

        let row = app.cells.firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        row.tap()

        let editButton = app.buttons["Edit Entry"]
        XCTAssertTrue(editButton.waitForExistence(timeout: 2))
        XCTAssertGreaterThanOrEqual(editButton.frame.width, 36)
        XCTAssertGreaterThanOrEqual(editButton.frame.height, 36)
        XCTAssertTrue(editButton.isHittable)
        editButton.tap()

        XCTAssertTrue(app.staticTexts["Edit Entry"].waitForExistence(timeout: 2))
        XCTAssertEqual(app.textViews.firstMatch.value as? String, "Entry ready to edit")
#endif
    }
}
