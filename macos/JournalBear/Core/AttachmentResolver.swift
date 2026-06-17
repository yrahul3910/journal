import Foundation

/// Resolves an entry's raw `attachment` references into decoded image bytes.
///
/// Across the format's history an attachment reference has been any of:
///   - a `data:` URL                         (`data:image/jpeg;base64,…`)
///   - an archive path                        (`./_jbfiles/images/<file>`)
///   - a bare filename                        (`<file>.png`)
///   - raw base64 with no prefix              (`/9j/…` JPEG, `iVBOR…` PNG)
/// This mirrors the branches in the Electron app's `decrypt-journal` handler, but
/// produces raw `Data` (NSImage detects the format) instead of reconstructing URLs.
enum AttachmentResolver {
    /// - Parameter files: every file in the archive, keyed by relative path
    ///   (e.g. `images/1700000000_0.jpg`).
    static func resolve(_ references: [String], in files: [String: Data]) -> [Data] {
        references.compactMap { resolveOne($0, in: files) }
    }

    private static func resolveOne(_ reference: String, in files: [String: Data]) -> Data? {
        // 1. data: URL — take everything after the comma as base64.
        if reference.hasPrefix("data:") {
            guard let comma = reference.firstIndex(of: ",") else { return nil }
            let base64 = String(reference[reference.index(after: comma)...])
            return Data(base64Encoded: base64, options: .ignoreUnknownCharacters)
        }

        // 2. Archive path / filename — match by last path component against the
        //    extracted `images/` files.
        let filename = reference.split(separator: "/").last.map(String.init) ?? reference
        if let data = files["images/" + filename] { return data }
        if let data = files[filename] { return data }
        if let match = files.first(where: { $0.key.hasSuffix("/" + filename) }) { return match.value }

        // 3. Raw base64 fallback — only accept it if the bytes are actually an image,
        //    so a missing path doesn't get mis-decoded into garbage.
        if let data = Data(base64Encoded: reference, options: .ignoreUnknownCharacters),
           looksLikeImage(data) {
            return data
        }

        return nil
    }

    private static func looksLikeImage(_ data: Data) -> Bool {
        if data.count >= 3, data[0] == 0xFF, data[1] == 0xD8, data[2] == 0xFF {
            return true // JPEG
        }
        if data.count >= 8, data[0] == 0x89, data[1] == 0x50, data[2] == 0x4E, data[3] == 0x47 {
            return true // PNG
        }
        return false
    }
}
