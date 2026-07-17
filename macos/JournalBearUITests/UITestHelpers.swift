import XCTest

extension XCUIElement {
    /// Click on macOS, tap on iOS.
    func activate() {
#if os(macOS)
        click()
#else
        tap()
#endif
    }
}

extension XCUIApplication {
    /// Starts the new-journal flow: the ⇧⌘N shortcut on macOS; on iOS the
    /// empty-state button when no journal is open, else the toolbar's
    /// journal menu.
    func startNewJournal() {
#if os(macOS)
        typeKey("n", modifierFlags: [.command, .shift])
#else
        if buttons["New Journal..."].exists {
            buttons["New Journal..."].tap()
        } else {
            buttons["Journal"].tap()
            buttons["New Journal…"].tap()
        }
#endif
    }

    /// Starts the open-journal flow: the ⌘O shortcut on macOS; on iOS the
    /// empty-state button when no journal is open, else the toolbar's
    /// journal menu.
    func startOpenJournal() {
#if os(macOS)
        typeKey("o", modifierFlags: .command)
#else
        if buttons["Open Journal..."].exists {
            buttons["Open Journal..."].tap()
        } else {
            buttons["Journal"].tap()
            buttons["Open Journal…"].tap()
        }
#endif
    }

    /// A button of the save/discard/cancel confirmation, which presents as a
    /// window sheet on macOS and an alert on iOS.
    func confirmationButton(_ title: String) -> XCUIElement {
#if os(macOS)
        sheets.buttons[title].firstMatch
#else
        alerts.buttons[title].firstMatch
#endif
    }
}
