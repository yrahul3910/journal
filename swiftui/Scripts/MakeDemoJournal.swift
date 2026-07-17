// Builds the fictional demo journal used for App Store screenshots.
// All content is invented; regenerate the file any time with:
//
//   cd swiftui
//   xcrun swiftc Scripts/MakeDemoJournal.swift JournalBear/Core/*.swift \
//     JournalBear/Models/Journal.swift -o /tmp/make_demo
//   /tmp/make_demo "../My Journal.zjournal"
//
// Password: $Password123

import Foundation

@main
struct MakeDemoJournal {
    static let password = "$Password123"

    static func main() throws {
        let path = CommandLine.arguments.count > 1
            ? CommandLine.arguments[1]
            : "My Journal.zjournal"
        let url = URL(fileURLWithPath: path)

        // Timezone-less dates parse in the local timezone, so the displayed
        // calendar day always matches what's written here.
        let entries = [
            JournalEntry(
                entryDate: "2026-07-16T08:05:00",
                content: """
                # Sourdough, attempt four

                It **finally** worked. Open crumb, real ear, kitchen smells \
                incredible. The difference this time:

                | Change | Why |
                | --- | --- |
                | 80% hydration | Crumb was too tight at 72% |
                | Cold retard overnight | Way more flavor |
                | Hotter oven start | Better spring |

                Freezing half the loaf before I eat all of it standing at the counter.
                """,
                sentiment: "Happy"
            ),
            JournalEntry(
                entryDate: "2026-07-15T19:40:00",
                content: """
                # Morning at Percy Warner Park

                Up before sunrise for the long loop. Worth every yawn:

                - Fog sitting in the valley until almost eight
                - A barred owl, *two* deer, and the world's least shy chipmunk
                - Coffee from the thermos at the overlook

                Note to self: the steep connector trail is much kinder going up than down.
                """,
                sentiment: "Happy"
            ),
            JournalEntry(
                entryDate: "2026-07-12T21:15:00",
                content: """
                # We booked the Kyoto trip!

                October 14–26. It's actually happening. Shortlist so far:

                - Arashiyama early, before the crowds
                - A whole day for Fushimi Inari, no schedule
                - The little jazz kissaten Maya keeps talking about
                - Day trip to Nara — *deliberately* getting mugged by the deer

                Started a phrasebook note. My pronunciation is a crime scene, but it's improving.
                """,
                sentiment: "Excited"
            ),
            JournalEntry(
                entryDate: "2026-07-06T22:30:00",
                content: """
                # Six years

                Dinner at the little place where we had our first date. They moved \
                the kitchen and repainted, but the corner table is still there.

                > "The best thing to hold onto in life is each other."

                We stayed until they stacked the chairs. I'd do all six years again tomorrow.
                """,
                sentiment: "Loved"
            ),
            JournalEntry(
                entryDate: "2026-06-29T14:20:00",
                content: """
                # Notes from *The Left Hand of Darkness*

                Halfway through and it keeps stopping me mid-page.

                > Light is the left hand of darkness, and darkness the right hand of light.

                What gets me is how patiently it builds — nothing is explained, \
                everything is *shown*. Adding the rest of the Hainish books to the list.
                """,
                sentiment: "Neutral"
            ),
            JournalEntry(
                entryDate: "2026-06-22T23:05:00",
                content: """
                # A heavy week

                Work was a lot, the news was a lot, and I didn't sleep enough to \
                carry either well. Writing it down instead of scrolling.

                Things that still worked:

                - Ran twice, slowly
                - Called Dad
                - The tomatoes on the balcony don't care what kind of week it was

                Tomorrow: earlier night, longer run.
                """,
                sentiment: "Sad"
            ),
        ]

        try JournalFile.save(entries, to: url, password: password)

        // Round-trip to prove the file opens with the app's own read path.
        let reopened = try JournalFile.open(url: url, password: password)
        print("Wrote \(url.path): \(reopened.entries.count) entries")
        for entry in reopened.entries {
            print("  \(entry.displayDate) — \(entry.sentiment)")
        }
    }
}
