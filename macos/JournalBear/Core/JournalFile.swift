import Foundation

struct JournalError: Error {
    let message: String

    static let tooSmall = JournalError(message: "The file is too small or corrupted.")
    static let decryptionFailed = JournalError(message: "Wrong password, or the file is corrupted.")
    static let decompressionFailed = JournalError(message: "The journal could not be decompressed.")
    static let parseFailed = JournalError(message: "The journal data could not be read.")
}

/// Reads a `.zjournal` file.
///
/// On-disk layout (produced by the Electron app):
///   `[16-byte salt][16-byte IV][AES-256-CBC ciphertext]`
/// where the plaintext is a gzip-compressed tar containing `data.json` (and an
/// `images/` directory of attachments).
enum JournalFile {
    static func open(url: URL, password: String) throws -> JournalData {
        let fileData = try Data(contentsOf: url)
        guard fileData.count > 32 else { throw JournalError.tooSmall }

        let salt = fileData.subdata(in: 0..<16)
        let iv = fileData.subdata(in: 16..<32)
        let ciphertext = fileData.subdata(in: 32..<fileData.count)

        let key = Crypto.deriveKey(password: password, salt: salt)
        let tarGz = try Crypto.aesCBCDecrypt(ciphertext: ciphertext, key: key, iv: iv)
        let tarball = try Gzip.decompress(tarGz)
        let files = Tar.extract(tarball)

        // `data.json` is the current name; `journal.json` is an older alias.
        guard let json = files["data.json"] ?? files["journal.json"] else {
            throw JournalError.parseFailed
        }

        do {
            return try JSONDecoder().decode(JournalData.self, from: json)
        } catch {
            throw JournalError.parseFailed
        }
    }
}
