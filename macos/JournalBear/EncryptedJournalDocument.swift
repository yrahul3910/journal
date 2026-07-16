import SwiftUI
import UniformTypeIdentifiers

/// The already-encrypted bytes of a journal, wrapped as a `FileDocument` so the
/// save-location dialog (`fileExporter`) can write them for a brand-new journal.
/// Encryption happens before export; this type never holds plaintext.
struct EncryptedJournalDocument: FileDocument {
    static let contentType = UTType(filenameExtension: "zjournal") ?? .data
    static var readableContentTypes: [UTType] { [contentType] }

    let data: Data

    init(data: Data) {
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
