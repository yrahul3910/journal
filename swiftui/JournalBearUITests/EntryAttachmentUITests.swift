import XCTest

final class EntryAttachmentUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

#if !os(macOS)
    @MainActor
    func testLockingClosesTheAttachmentPreview() throws {
        let fixtureURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("test_journal.zjournal")
        XCTAssertTrue(FileManager.default.fileExists(atPath: fixtureURL.path))

        let app = XCUIApplication()
        app.launchEnvironment["JOURNALBEAR_UI_TEST_JOURNAL"] = fixtureURL.path
        app.launchEnvironment["JOURNALBEAR_UI_TEST_PASSWORD"] = "$Password123"
        app.launchEnvironment["JOURNALBEAR_UI_TEST_LOCK_ATTACHMENT_PREVIEW"] = "1"
        app.launchClean()

        let row = app.cells.containing(
            NSPredicate(format: "label CONTAINS %@ OR value CONTAINS %@",
                        "second entry on June 16", "second entry on June 16")
        ).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        row.tap()

        let firstAttachment = app.descendants(matching: .any)["entry-attachment-0"]
        XCTAssertTrue(firstAttachment.waitForExistence(timeout: 5))
        var swipes = 0
        while !firstAttachment.isHittable && swipes < 5 {
            app.swipeUp()
            swipes += 1
        }
        firstAttachment.tap()

        XCTAssertTrue(app.staticTexts["Journal Locked"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.descendants(matching: .any)["attachment-preview"].exists)
        XCTAssertEqual(app.secureTextFields.matching(identifier: "journal-lock-screen").count, 1)
    }

    @MainActor
    func testTappingAnAttachmentOpensThePreviewSheet() throws {
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

        // No auto-selection on iPhone; open the entry from the list.
        let row = app.cells.containing(
            NSPredicate(format: "label CONTAINS %@ OR value CONTAINS %@",
                        "second entry on June 16", "second entry on June 16")
        ).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        row.tap()

        // The attachments sit below the entry text; scroll them into view.
        let firstAttachment = app.descendants(matching: .any)["entry-attachment-0"]
        XCTAssertTrue(firstAttachment.waitForExistence(timeout: 5))
        var swipes = 0
        while !firstAttachment.isHittable && swipes < 5 {
            app.swipeUp()
            swipes += 1
        }
        firstAttachment.tap()

        let previewImage = app.descendants(matching: .any)["attachment-preview"]
        XCTAssertTrue(previewImage.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["1 of 2"].waitForExistence(timeout: 2))

        // Swiping pages between attachments.
        previewImage.swipeLeft()
        XCTAssertTrue(app.staticTexts["2 of 2"].waitForExistence(timeout: 2))

        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = "attachment-lightbox-ios"
        screenshot.lifetime = .keepAlways
        add(screenshot)

        // Tapping the image dismisses, like the Electron modal.
        previewImage.tap()
        XCTAssertTrue(previewImage.waitForNonExistence(timeout: 5))
    }
#endif

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
        let firstAttachment = app.descendants(matching: .any)["entry-attachment-0"]
        XCTAssertTrue(firstAttachment.waitForExistence(timeout: 5))
        XCTAssertTrue(
            app.descendants(matching: .any)["entry-attachment-1"].waitForExistence(timeout: 5)
        )

        // Clicking an attachment opens the enlarged preview. The image sits
        // leading in a full-width row, so click near the left edge.
        firstAttachment.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.5)).click()
        let previewImage = app.descendants(matching: .any)["attachment-preview"]
        XCTAssertTrue(previewImage.waitForExistence(timeout: 5))

        // With two attachments the lightbox shows a counter and chevrons.
        XCTAssertTrue(app.staticTexts["1 of 2"].waitForExistence(timeout: 2))
        let next = app.descendants(matching: .any)["attachment-preview-next"]
        XCTAssertTrue(next.waitForExistence(timeout: 2))
        next.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).click()
        XCTAssertTrue(app.staticTexts["2 of 2"].waitForExistence(timeout: 2))

        // Full screen: the lightbox window can be larger than the journal
        // window, which a window-scoped capture would crop.
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = "attachment-lightbox"
        screenshot.lifetime = .keepAlways
        add(screenshot)

        // Clicking the preview image closes it, like the Electron modal.
        previewImage.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).click()
        XCTAssertTrue(previewImage.waitForNonExistence(timeout: 5))

        // Escape closes it too.
        firstAttachment.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.5)).click()
        XCTAssertTrue(previewImage.waitForExistence(timeout: 5))
        app.typeKey(.escape, modifierFlags: [])
        XCTAssertTrue(previewImage.waitForNonExistence(timeout: 5))
#endif
    }
}
