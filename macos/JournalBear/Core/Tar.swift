import Foundation

/// Minimal USTAR tar reader.
///
/// The journal archive only ever contains short paths (`data.json` and
/// `images/<file>`), so we handle plain regular-file and directory records and skip
/// anything exotic (PAX/GNU extension records) by advancing past their payload.
enum Tar {
    private static let blockSize = 512

    /// Returns every regular file in the archive keyed by its (relative) path.
    static func extract(_ data: Data) -> [String: Data] {
        var files: [String: Data] = [:]
        var offset = 0
        let count = data.count

        func string(at start: Int, length: Int) -> String {
            let end = min(start + length, count)
            guard start < end else { return "" }
            let slice = data.subdata(in: start..<end)
            if let nul = slice.firstIndex(of: 0) {
                return String(decoding: slice[..<nul], as: UTF8.self)
            }
            return String(decoding: slice, as: UTF8.self)
        }

        while offset + blockSize <= count {
            let header = data.subdata(in: offset..<offset + blockSize)
            if header.allSatisfy({ $0 == 0 }) { break } // end-of-archive marker

            let name = string(at: offset, length: 100)
            let prefix = string(at: offset + 345, length: 155)
            let sizeField = string(at: offset + 124, length: 12)
                .trimmingCharacters(in: CharacterSet(charactersIn: " \0"))
            let typeflag = data[offset + 156]
            let size = Int(sizeField, radix: 8) ?? 0

            offset += blockSize
            let fullName = prefix.isEmpty ? name : "\(prefix)/\(name)"

            // '0' or NUL == regular file. Everything else (dirs, PAX, GNU) is skipped.
            if typeflag == UInt8(ascii: "0") || typeflag == 0 {
                let end = min(offset + size, count)
                files[fullName] = size > 0 ? data.subdata(in: offset..<end) : Data()
            }

            // Advance past the file payload, rounded up to a 512-byte boundary.
            offset += (size + blockSize - 1) / blockSize * blockSize
        }

        return files
    }
}
