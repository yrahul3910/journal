import crypto from "crypto";
import fs from "fs";
import { pipeline } from "stream/promises";
import owasp from "owasp-password-strength-test";

const algorithm = "aes-256-cbc";
const SALT_LENGTH = 16;
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

const deriveKey = (password: string, salt: Buffer): Buffer => {
    return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, "sha256");
};

export const getEncryptedText = (text: string, pwd: string): string => {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = deriveKey(pwd, salt);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    // Prepend salt and IV to the encrypted data
    return salt.toString("hex") + ":" + iv.toString("hex") + ":" + encrypted;
};

export const getDecryptedText = (
    text: string,
    pwd: string,
): string | undefined => {
    try {
        const parts = text.split(":");

        const salt = Buffer.from(parts[0], "hex");
        const iv = Buffer.from(parts[1], "hex");
        const encrypted = parts[2];
        const key = deriveKey(pwd, salt);

        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        return (
            decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8")
        );
    } catch (ex) {
        console.error("[ENCRYPTION] Decryption error:", ex);
        return undefined;
    }
};

export const checkPasswordStrength = (pwd: string): string[] => {
    owasp.config({
        minLength: 8,
    });

    const result = owasp.test(pwd);
    if (result.errors) return result.errors;
    else return [];
};

export const encryptFile = (
    path: string,
    outputPath: string,
    key: string,
): Promise<void> => {
    return new Promise((resolve, reject) => {
        try {
            const salt = crypto.randomBytes(SALT_LENGTH);
            const iv = crypto.randomBytes(IV_LENGTH);
            const derivedKey = deriveKey(key, salt);

            const cipher = crypto.createCipheriv(algorithm, derivedKey, iv);
            const input = fs.createReadStream(path);
            const output = fs.createWriteStream(outputPath);

            // Write salt and IV first
            output.write(salt);
            output.write(iv);

            input.pipe(cipher).pipe(output);

            output.on("finish", () => {
                console.log("[ENCRYPTION] File encrypted successfully");
                resolve();
            });

            input.on("error", (err) => {
                console.error("[ENCRYPTION] Encrypt input error:", err);
                reject(err);
            });

            output.on("error", (err) => {
                console.error("[ENCRYPTION] Encrypt output error:", err);
                reject(err);
            });

            cipher.on("error", (err) => {
                console.error("[ENCRYPTION] Cipher error:", err);
                reject(err);
            });
        } catch (ex) {
            console.error("[ENCRYPTION] Encrypt file error:", ex);
            reject(ex as Error);
        }
    });
};

/**
 * Decrypt the journal at `path` into `outputPath`, which receives the
 * plaintext `.tar.gz`. Returns null on success and the error otherwise; a
 * wrong password surfaces as the cipher's padding error.
 *
 * The file is streamed through the decipher, so a journal of any size
 * decrypts in bounded memory (reading it whole fails past 2 GiB).
 */
export const decryptFile = async (
    path: string,
    outputPath: string,
    key: string,
): Promise<Error | null> => {
    try {
        const header = Buffer.alloc(SALT_LENGTH + IV_LENGTH);
        const file = await fs.promises.open(path);
        const { bytesRead } = await file.read(header, 0, header.length, 0);
        await file.close();

        if (bytesRead < header.length) {
            return new Error("File too small or corrupted");
        }

        const salt = header.subarray(0, SALT_LENGTH);
        const iv = header.subarray(SALT_LENGTH);
        const decipher = crypto.createDecipheriv(
            algorithm,
            deriveKey(key, salt),
            iv,
        );

        await pipeline(
            fs.createReadStream(path, { start: header.length }),
            decipher,
            fs.createWriteStream(outputPath),
        );
        console.log("[ENCRYPTION] Decrypted successfully");

        return null;
    } catch (ex) {
        console.error("[ENCRYPTION] Decrypt file error:", ex);
        return ex instanceof Error ? ex : new Error(String(ex));
    }
};
