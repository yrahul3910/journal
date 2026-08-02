import XCTest

final class EntryAttachmentUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testSelectingAnEntryRendersItsAttachments() throws {
#if !os(macOS)
        throw XCTSkip("Covers the macOS off-main attachment decode path.")
#else
        let fixtureURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("test_journal.zjournal")
        XCTAssertTrue(FileManager.default.fileExists(atPath: fixtureURL.path))

        let app = XCUIApplication()
        app.launchEnvironment["JOURNALBEAR_UI_TEST_JOURNAL"] = fixtureURL.path
        app.launchEnvironment["JOURNALBEAR_UI_TEST_PASSWORD"] = "$Password123"
        app.launchClean()

        // The detail pane may already show this entry's content (the split
        // view auto-selects a row), so scope the click to the sidebar list.
        let sidebar = app.outlines.firstMatch
        XCTAssertTrue(sidebar.waitForExistence(timeout: 5))
        let entryWithImages = sidebar.staticTexts[
            "This is a second entry on June 16. It has two images attached."
        ]
        XCTAssertTrue(entryWithImages.waitForExistence(timeout: 5))
        // List row text reports as non-hittable, so click by coordinate.
        entryWithImages.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).click()

        XCTAssertTrue(app.staticTexts["2 attachments"].waitForExistence(timeout: 5))

        // Attachments decode off the main thread after selection, so give
        // both images a moment to land.
        XCTAssertTrue(
            app.descendants(matching: .any)["entry-attachment-0"].waitForExistence(timeout: 5)
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["entry-attachment-1"].waitForExistence(timeout: 5)
        )
#endif
    }
}
