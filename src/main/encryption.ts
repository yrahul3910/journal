import crypto from "crypto";
import fs from "fs";
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
    func: (err?: Error) => void,
): void => {
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
            func();
        });

        output.on("error", (err) => {
            console.error("[ENCRYPTION] Encrypt output error:", err);
            func(err);
        });

        cipher.on("error", (err) => {
            console.error("[ENCRYPTION] Cipher error:", err);
            func(err);
        });
    } catch (ex) {
        console.error("[ENCRYPTION] Encrypt file error:", ex);
        func(ex as Error);
    }
};

export const decryptFile = (
    path: string,
    outputPath: string,
    key: string,
    func: (err?: Error) => void,
): void => {
    try {
        console.log("[ENCRYPTION] Starting file decryption...");
        console.log("[ENCRYPTION] Input path:", path);
        console.log("[ENCRYPTION] Output path:", outputPath);

        // Check file size first to determine if it's a legacy file
        const stats = fs.statSync(path);
        console.log("[ENCRYPTION] File size:", stats.size);

        // Read the entire file to detect format
        const fileContent = fs.readFileSync(path);
        console.log("[ENCRYPTION] File read, size:", fileContent.length);
        tryNewFormatFromBuffer(fileContent, outputPath, key, func);
    } catch (ex) {
        console.error("[ENCRYPTION] Decrypt file error:", ex);
        func(ex as Error);
    }
};

const tryNewFormatFromBuffer = (
    fileBuffer: Buffer,
    outputPath: string,
    key: string,
    func: (err?: Error) => void,
): void => {
    try {
        console.log("[ENCRYPTION] Trying new format from buffer...");

        if (fileBuffer.length < SALT_LENGTH + IV_LENGTH) {
            console.error("[ENCRYPTION] File too small for new format");
            func(new Error("File too small or corrupted"));
            return;
        }

        const salt = fileBuffer.slice(0, SALT_LENGTH);
        const iv = fileBuffer.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const encrypted = fileBuffer.slice(SALT_LENGTH + IV_LENGTH);

        console.log("[ENCRYPTION] Extracted salt and IV from buffer");

        const derivedKey = deriveKey(key, salt);
        const decipher = crypto.createDecipheriv(algorithm, derivedKey, iv);

        try {
            const decrypted = Buffer.concat([
                decipher.update(encrypted),
                decipher.final(),
            ]);

            console.log("[ENCRYPTION] Decrypted successfully (new format)");
            fs.writeFileSync(outputPath, decrypted);
            func();
        } catch (err) {
            console.error("[ENCRYPTION] New format decipher error:", err);
            func(err as Error);
        }
    } catch (ex) {
        console.error("[ENCRYPTION] New format exception:", ex);
        func(ex as Error);
    }
};
