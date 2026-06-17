import Foundation
import CommonCrypto

/// Cryptographic primitives matching the Electron app's `encryption.ts`.
///
/// Key derivation: PBKDF2-HMAC-SHA256, 100_000 rounds, 32-byte key.
/// Cipher: AES-256-CBC with PKCS#7 padding.
enum Crypto {
    static let rounds = 100_000
    static let keyLength = 32

    static func deriveKey(password: String, salt: Data) -> Data {
        var derived = Data(count: keyLength)
        let saltBytes = [UInt8](salt)

        let status = derived.withUnsafeMutableBytes { derivedRaw -> Int32 in
            saltBytes.withUnsafeBufferPointer { saltPtr in
                CCKeyDerivationPBKDF(
                    CCPBKDFAlgorithm(kCCPBKDF2),
                    password, password.utf8.count,
                    saltPtr.baseAddress, saltPtr.count,
                    CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
                    UInt32(rounds),
                    derivedRaw.bindMemory(to: UInt8.self).baseAddress, keyLength
                )
            }
        }

        precondition(status == kCCSuccess, "PBKDF2 derivation failed")
        return derived
    }

    static func aesCBCDecrypt(ciphertext: Data, key: Data, iv: Data) throws -> Data {
        let bufferSize = ciphertext.count + kCCBlockSizeAES128
        var output = Data(count: bufferSize)
        var decryptedCount = 0

        let status = output.withUnsafeMutableBytes { outRaw -> Int32 in
            ciphertext.withUnsafeBytes { inRaw in
                key.withUnsafeBytes { keyRaw in
                    iv.withUnsafeBytes { ivRaw in
                        CCCrypt(
                            CCOperation(kCCDecrypt),
                            CCAlgorithm(kCCAlgorithmAES),
                            CCOptions(kCCOptionPKCS7Padding),
                            keyRaw.baseAddress, key.count,
                            ivRaw.baseAddress,
                            inRaw.baseAddress, ciphertext.count,
                            outRaw.baseAddress, bufferSize,
                            &decryptedCount
                        )
                    }
                }
            }
        }

        guard status == kCCSuccess else { throw JournalError.decryptionFailed }
        output.removeSubrange(decryptedCount..<output.count)
        return output
    }
}
