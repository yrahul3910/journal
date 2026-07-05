import Foundation
import Compression

/// Minimal gzip (RFC 1952) decoder.
///
/// Apple's Compression framework decodes the raw DEFLATE stream (RFC 1951) but does
/// not understand the gzip wrapper, so we parse and strip the gzip header ourselves
/// and feed the remainder to the streaming inflate API.
enum Gzip {
    static func decompress(_ data: Data) throws -> Data {
        let bytes = [UInt8](data)
        guard bytes.count > 18,
              bytes[0] == 0x1f, bytes[1] == 0x8b, bytes[2] == 0x08 else {
            throw JournalError.decompressionFailed
        }

        let flags = bytes[3]
        var offset = 10 // fixed gzip header length

        if flags & 0x04 != 0 { // FEXTRA
            guard offset + 2 <= bytes.count else { throw JournalError.decompressionFailed }
            let xlen = Int(bytes[offset]) | (Int(bytes[offset + 1]) << 8)
            offset += 2 + xlen
        }
        if flags & 0x08 != 0 { // FNAME (zero-terminated)
            while offset < bytes.count && bytes[offset] != 0 { offset += 1 }
            offset += 1
        }
        if flags & 0x10 != 0 { // FCOMMENT (zero-terminated)
            while offset < bytes.count && bytes[offset] != 0 { offset += 1 }
            offset += 1
        }
        if flags & 0x02 != 0 { // FHCRC
            offset += 2
        }

        guard offset < data.count else { throw JournalError.decompressionFailed }
        let deflateStream = data.subdata(in: offset..<data.count)
        return try inflate(deflateStream)
    }

    static func compress(_ data: Data) throws -> Data {
        // Fixed 10-byte gzip header: magic, deflate, no flags, no mtime, OS=unix.
        var output = Data([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03])
        output.append(try deflate(data))

        var crc = crc32(data).littleEndian
        withUnsafeBytes(of: &crc) { output.append(contentsOf: $0) }
        var isize = UInt32(truncatingIfNeeded: data.count).littleEndian
        withUnsafeBytes(of: &isize) { output.append(contentsOf: $0) }

        return output
    }

    private static func deflate(_ input: Data) throws -> Data {
        let streamPtr = UnsafeMutablePointer<compression_stream>.allocate(capacity: 1)
        defer { streamPtr.deallocate() }

        guard compression_stream_init(streamPtr, COMPRESSION_STREAM_ENCODE, COMPRESSION_ZLIB)
                == COMPRESSION_STATUS_OK else {
            throw JournalError.compressionFailed
        }
        defer { compression_stream_destroy(streamPtr) }

        let chunkSize = 1 << 20
        let dst = UnsafeMutablePointer<UInt8>.allocate(capacity: chunkSize)
        defer { dst.deallocate() }

        var output = Data()
        let inputBytes = [UInt8](input)

        try inputBytes.withUnsafeBufferPointer { src in
            streamPtr.pointee.src_ptr = src.baseAddress!
            streamPtr.pointee.src_size = src.count

            while true {
                streamPtr.pointee.dst_ptr = dst
                streamPtr.pointee.dst_size = chunkSize

                let status = compression_stream_process(
                    streamPtr, Int32(COMPRESSION_STREAM_FINALIZE.rawValue)
                )

                let produced = chunkSize - streamPtr.pointee.dst_size
                if produced > 0 { output.append(dst, count: produced) }

                switch status {
                case COMPRESSION_STATUS_END:
                    return
                case COMPRESSION_STATUS_OK:
                    if produced == 0 && streamPtr.pointee.src_size == 0 { return }
                default:
                    throw JournalError.compressionFailed
                }
            }
        }

        return output
    }

    private static let crcTable: [UInt32] = (0..<256).map { i -> UInt32 in
        var c = UInt32(i)
        for _ in 0..<8 { c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1 }
        return c
    }

    private static func crc32(_ data: Data) -> UInt32 {
        var crc: UInt32 = 0xFFFFFFFF
        for byte in data {
            crc = crcTable[Int((crc ^ UInt32(byte)) & 0xFF)] ^ (crc >> 8)
        }
        return crc ^ 0xFFFFFFFF
    }

    private static func inflate(_ input: Data) throws -> Data {
        let streamPtr = UnsafeMutablePointer<compression_stream>.allocate(capacity: 1)
        defer { streamPtr.deallocate() }

        guard compression_stream_init(streamPtr, COMPRESSION_STREAM_DECODE, COMPRESSION_ZLIB)
                == COMPRESSION_STATUS_OK else {
            throw JournalError.decompressionFailed
        }
        defer { compression_stream_destroy(streamPtr) }

        let chunkSize = 1 << 20 // 1 MiB
        let dst = UnsafeMutablePointer<UInt8>.allocate(capacity: chunkSize)
        defer { dst.deallocate() }

        var output = Data()
        let inputBytes = [UInt8](input)

        try inputBytes.withUnsafeBufferPointer { src in
            streamPtr.pointee.src_ptr = src.baseAddress!
            streamPtr.pointee.src_size = src.count

            while true {
                streamPtr.pointee.dst_ptr = dst
                streamPtr.pointee.dst_size = chunkSize

                let status = compression_stream_process(
                    streamPtr, Int32(COMPRESSION_STREAM_FINALIZE.rawValue)
                )

                let produced = chunkSize - streamPtr.pointee.dst_size
                if produced > 0 { output.append(dst, count: produced) }

                switch status {
                case COMPRESSION_STATUS_END:
                    return
                case COMPRESSION_STATUS_OK:
                    // Need another pass to flush more output.
                    if produced == 0 && streamPtr.pointee.src_size == 0 { return }
                default:
                    throw JournalError.decompressionFailed
                }
            }
        }

        return output
    }
}
