import Foundation

struct EntrySearchCriteria: Equatable {
    var text = ""
    var sentiment: String?
    var hasAttachments = false

    var isActive: Bool {
        !text.isEmpty || sentiment != nil || hasAttachments
    }

    func filter(_ entries: [JournalEntry]) -> [JournalEntry] {
        entries.filter(matches)
    }

    private func matches(_ entry: JournalEntry) -> Bool {
        if !text.isEmpty,
           entry.content.range(of: text, options: [.caseInsensitive]) == nil
        {
            return false
        }
        if let sentiment, entry.sentiment != sentiment {
            return false
        }
        if hasAttachments && entry.attachments.isEmpty {
            return false
        }
        return true
    }
}
