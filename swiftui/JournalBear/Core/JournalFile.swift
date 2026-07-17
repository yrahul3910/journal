import Foundation

struct JournalError: Error {
    let message: String

    static let tooSmall = JournalError(message: "The file is too small or corrupted.")
    static let decryptionFailed = JournalError(message: "Wrong password, or the file is corrupted.")
    static let decompressionFailed = JournalError(message: "The journal could not be decompressed.")
    static let parseFailed = JournalError(message: "The journal data could not be read.")
    static let encryptionFailed = JournalError(message: "The journal could not be encrypted.")
    static let compressionFailed = JournalError(message: "The journal could not be compressed.")
    static let saveFailed = JournalError(message: "The journal could not be saved.")
}

/// Reads a `.zjournal` file. Supports the 7.0 format only.
///
/// On-disk layout (produced by the Electron app):
///   `[16-byte salt][16-byte IV][AES-256-CBC ciphertext]`
/// where the plaintext is a gzip-compressed tar containing `data.json` and an
/// `images/` directory holding every attachment as a plain image file.
enum JournalFile {
    static func open(url: URL, password: String) throws -> JournalData {
        // URLs from the system file pickers are security-scoped on iOS (and in
        // sandboxed macOS builds); plain path URLs return false here and need
        // no matching stop.
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        let fileData = try Data(contentsOf: url)
        guard fileData.count > 32 else { throw JournalError.tooSmall }

        let salt = fileData.subdata(in: 0..<16)
        let iv = fileData.subdata(in: 16..<32)
        let ciphertext = fileData.subdata(in: 32..<fileData.count)

        let key = Crypto.deriveKey(password: password, salt: salt)
        let tarGz = try Crypto.aesCBCDecrypt(ciphertext: ciphertext, key: key, iv: iv)
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
            resolved.images = entry.attachments.compactMap { reference in
                let filename = reference.split(separator: "/").last.map(String.init) ?? reference
                return files["images/" + filename]
            }
            return resolved
        }

        return data
    }

    /// Writes `entries` to `url`, encrypted with `password`, in the same on-disk
    /// format the Electron app reads: a gzipped USTAR of `data.json` + an `images/`
    /// directory, AES-256-CBC encrypted with a fresh salt + IV prepended.
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

    /// Produces the complete `.zjournal` byte layout for `entries` without
    /// touching disk, for callers that let the system write the file (the
    /// save-location exporter for brand-new journals).
    static func encrypt(_ entries: [JournalEntry], password: String) throws -> Data {
        var archiveFiles: [(name: String, data: Data)] = []
        var diskEntries: [DiskEntry] = []

        for entry in entries {
            var refs: [String] = []
            for image in entry.images {
                let filename = "\(UUID().uuidString).\(imageExtension(image))"
                archiveFiles.append((name: "images/\(filename)", data: image))
                refs.append("./_jbfiles/images/\(filename)")
            }
            diskEntries.append(DiskEntry(
                entryDate: entry.entryDate,
                content: entry.content,
                sentiment: entry.sentiment,
                attachments: refs
            ))
        }

        let json = try JSONEncoder().encode(DiskJournal(version: 7, entries: diskEntries))
        archiveFiles.insert((name: "data.json", data: json), at: 0)

        let tarball = Tar.create(archiveFiles)
        let gzipped = try Gzip.compress(tarball)

        let salt = Crypto.randomBytes(16)
        let iv = Crypto.randomBytes(16)
        let key = Crypto.deriveKey(password: password, salt: salt)
        let ciphertext = try Crypto.aesCBCEncrypt(plaintext: gzipped, key: key, iv: iv)

        var output = salt
        output.append(iv)
        output.append(ciphertext)
        return output
    }

    private static func imageExtension(_ data: Data) -> String {
        // PNG signature 89 50 4E 47; everything else is treated as JPEG.
        if data.count >= 4, data[0] == 0x89, data[1] == 0x50, data[2] == 0x4E, data[3] == 0x47 {
            return "png"
        }
        return "jpg"
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
