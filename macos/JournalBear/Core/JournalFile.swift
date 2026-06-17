import Foundation

struct JournalError: Error {
    let message: String

    static let tooSmall = JournalError(message: "The file is too small or corrupted.")
    static let decryptionFailed = JournalError(message: "Wrong password, or the file is corrupted.")
    static let decompressionFailed = JournalError(message: "The journal could not be decompressed.")
    static let parseFailed = JournalError(message: "The journal data could not be read.")
}

/// Reads a `.zjournal` file. Supports the 7.0 format only.
///
/// On-disk layout (produced by the Electron app):
///   `[16-byte salt][16-byte IV][AES-256-CBC ciphertext]`
/// where the plaintext is a gzip-compressed tar containing `data.json` and an
/// `images/` directory holding every attachment as a plain image file.
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
        data.en = data.en.map { entry in
            var resolved = entry
            resolved.images = entry.attachment.compactMap { reference in
                let filename = reference.split(separator: "/").last.map(String.init) ?? reference
                return files["images/" + filename]
            }
            return resolved
        }

        return data
    }
}
