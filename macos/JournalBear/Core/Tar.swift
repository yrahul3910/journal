import Foundation

/// Minimal USTAR tar reader.
///
/// The journal archive only ever contains short paths (`data.json` and
/// `images/<file>`), so we handle plain regular-file and directory records and skip
/// anything exotic (PAX/GNU extension records) by advancing past their payload.
enum Tar {
    private static let blockSize = 512

    /// Builds a USTAR archive from the given files (relative paths + bytes).
    static func create(_ files: [(name: String, data: Data)]) -> Data {
        var archive = Data()
        for file in files {
            archive.append(header(name: file.name, size: file.data.count))
            archive.append(file.data)
            let remainder = file.data.count % blockSize
            if remainder != 0 {
                archive.append(Data(count: blockSize - remainder))
            }
        }
        // Two zero blocks mark the end of the archive.
        archive.append(Data(count: blockSize * 2))
        return archive
    }

    private static func header(name: String, size: Int) -> Data {
        var header = [UInt8](repeating: 0, count: blockSize)

        func write(_ string: String, at offset: Int, max length: Int) {
            for (i, byte) in string.utf8.prefix(length).enumerated() {
                header[offset + i] = byte
            }
        }

        write(name, at: 0, max: 100)
        write("0000644", at: 100, max: 8)                       // mode
        write("0000000", at: 108, max: 8)                       // uid
        write("0000000", at: 116, max: 8)                       // gid
        write(String(format: "%011o", size), at: 124, max: 12)  // size (octal)
        write(String(format: "%011o", 0), at: 136, max: 12)     // mtime
        for i in 148..<156 { header[i] = 0x20 }                 // checksum field = spaces
        header[156] = UInt8(ascii: "0")                         // typeflag: regular file
        write("ustar", at: 257, max: 6)                         // magic "ustar\0"
        write("00", at: 263, max: 2)                            // version

        // Checksum = sum of all header bytes with the checksum field as spaces.
        let checksum = header.reduce(0) { $0 + Int($1) }
        write(String(format: "%06o", checksum), at: 148, max: 6)
        header[154] = 0     // NUL
        header[155] = 0x20  // space

        return Data(header)
    }

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
