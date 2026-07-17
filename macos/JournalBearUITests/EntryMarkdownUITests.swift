import XCTest

final class EntryMarkdownUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testRendersStructuredMarkdown() throws {
        let app = XCUIApplication()
        app.launchEnvironment["JOURNALBEAR_UI_TEST_ENTRY_CONTENT"] = """
            # Markdown Test Heading

            Markdown Test Paragraph

            - Markdown Test List Item
            - Markdown Test Second Item

            > Markdown Test Quote

            ```swift
            let markdownTestCode = true
            ```

            | Markdown Test Column | Another Column |
            | --- | --- |
            | Markdown Test Cell | Another Cell |
            """
        app.launchClean()

#if os(iOS)
        // No auto-selection on iPhone; open the entry from the list.
        let row = app.cells.firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        row.tap()
#endif

        XCTAssertTrue(app.staticTexts["Markdown Test Heading"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Markdown Test Paragraph"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.staticTexts["Markdown Test List Item"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.staticTexts["Markdown Test Quote"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.staticTexts["let markdownTestCode = true"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.staticTexts["Markdown Test Cell"].waitForExistence(timeout: 2))
    }
}
