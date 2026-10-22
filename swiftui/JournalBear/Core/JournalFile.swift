import Foundation

struct JournalError: Error, Equatable {
    let message: String

    static let tooSmall = JournalError(message: "The file is too small or corrupted.")
    static let decryptionFailed = JournalError(message: "Wrong password, or the file is corrupted.")
    static let wrongPassword = JournalError(message: "Wrong password.")
    static let damaged = JournalError(message: "This journal is damaged and can't be opened.")
    static let newerVersion = JournalError(
        message: "This journal was made by a newer version of JournalBear. Update the app to open it."
    )
    static let keyDerivationFailed = JournalError(
        message: "There isn't enough free memory to unlock or save the journal."
    )
    static let decompressionFailed = JournalError(message: "The journal could not be decompressed.")
    static let parseFailed = JournalError(message: "The journal data could not be read.")
    static let saveNotVerified = JournalError(
        message: "The journal could not be saved: the new file did not reopen correctly."
    )
    static let compressionFailed = JournalError(message: "The journal could not be compressed.")
    static let saveFailed = JournalError(message: "The journal could not be saved.")
}

/// Reads and writes `.zjournal` files.
///
/// The plaintext of every journal is a gzip-compressed tar containing
/// `data.json` and an `images/` directory holding every attachment, image or
/// video, as a plain file. Saving always encrypts it as format 7.1 (see
/// `JournalContainer`); opening also accepts the legacy 7.0 layout,
/// `[16-byte salt][16-byte IV][AES-256-CBC ciphertext]`.
enum JournalFile {
    static func open(url: URL, password: String) throws -> JournalData {
        // URLs from the system file pickers are security-scoped on iOS (and in
        // sandboxed macOS builds); plain path URLs return false here and need
        // no matching stop.
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        let fileData = try Data(contentsOf: url)
        let tarGz: Data

        if JournalContainer.isContainer(fileData) {
            tarGz = try JournalContainer.open(fileData, password: password)
        } else {
            guard fileData.count > 32 else { throw JournalError.tooSmall }

            let salt = fileData.subdata(in: 0..<16)
            let iv = fileData.subdata(in: 16..<32)
            let ciphertext = fileData.subdata(in: 32..<fileData.count)
            let key = Crypto.deriveKey(password: password, salt: salt)
            tarGz = try Crypto.aesCBCDecrypt(ciphertext: ciphertext, key: key, iv: iv)
        }

        let tarball = try Gzip.decompress(tarGz)
        let files = Tar.extract(tarball)

        guard let json = files["data.json"] else {
            throw JournalError.parseFailed
        }

        var data: JournalData
        do {
            data = try JSONDecoder().decode(JournalData.self, from: json)
        } catch {
            throw JournalError.parseFailed
        }

        // Every attachment is a file under `images/`, referenced by name.
        data.entries = data.entries.map { entry in
            var resolved = entry
            resolved.media = entry.attachments.compactMap { reference in
                let filename = reference.split(separator: "/").last.map(String.init) ?? reference
                return files["images/" + filename].map { MediaAttachment(data: $0, filename: filename) }
            }
            return resolved
        }

        return data
    }

    /// Writes `entries` to `url` as a 7.1 journal encrypted with `password`,
    /// replacing the file atomically once the new bytes have been verified.
    static func save(_ entries: [JournalEntry], to url: URL, password: String) throws {
        let output = try encrypt(entries, password: password)

        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        do {
            try output.write(to: url, options: .atomic)
        } catch {
            throw JournalError.saveFailed
        }
    }

    /// Produces the complete `.zjournal` bytes for `entries` without touching
    /// disk, for callers that let the system write the file (the save-location
    /// exporter for brand-new journals).
    ///
    /// The bytes are opened through the read path, from the header just
    /// written, before they are returned; anything that does not decrypt to
    /// the archive it was made from throws `JournalError.saveNotVerified`, so
    /// no caller can replace a journal with a file nobody could open.
    static func encrypt(_ entries: [JournalEntry], password: String) throws -> Data {
        var archiveFiles: [(name: String, data: Data)] = []
        var diskEntries: [DiskEntry] = []

        for entry in entries {
            var refs: [String] = []
            for attachment in entry.media {
                let filename = "\(UUID().uuidString).\(fileExtension(for: attachment))"
                archiveFiles.append((name: "images/\(filename)", data: attachment.data))
                refs.append("./_jbfiles/images/\(filename)")
            }
            diskEntries.append(DiskEntry(
                entryDate: entry.entryDate,
                content: entry.content,
                sentiment: entry.sentiment,
                attachments: refs
            ))
        }

        let json = try JSONEncoder().encode(DiskJournal(version: 7.1, entries: diskEntries))
        archiveFiles.insert((name: "data.json", data: json), at: 0)

        // Compressing the tarball as a temporary frees it before sealing and
        // verifying need their own journal-sized buffers.
        let gzipped = try Gzip.compress(Tar.create(archiveFiles))

        let file = try JournalContainer.seal(gzipped, password: password)

        guard (try? JournalContainer.open(file, password: password)) == gzipped else {
            throw JournalError.saveNotVerified
        }
        return file
    }

    /// Videos are archived as `.mp4` whatever their source container: MOV and
    /// MP4 share the ISO base media format, and both apps play either under
    /// that name.
    private static func fileExtension(for attachment: MediaAttachment) -> String {
        let data = attachment.data

        switch attachment.kind {
        case .video:
            return "mp4"
        case .image:
            // PNG signature 89 50 4E 47; everything else is treated as JPEG.
            if data.count >= 4, data[0] == 0x89, data[1] == 0x50, data[2] == 0x4E, data[3] == 0x47 {
                return "png"
            }
            return "jpg"
        }
    }
}

/// On-disk `data.json` schema — the encodable counterpart of `JournalData`.
/// Deliberately excludes the in-memory-only `id` / `images` fields.
private struct DiskJournal: Encodable {
    let version: Double
    let entries: [DiskEntry]
}

private struct DiskEntry: Encodable {
    let entryDate: String
    let content: String
    let sentiment: String
    let attachments: [String]
}
