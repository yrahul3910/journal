import crypto from "crypto";
import fs from "fs";
import { pipeline } from "stream/promises";

import owasp from "owasp-password-strength-test";

import {
    ContainerError,
    type ContainerFailure,
    isContainer,
    openContainer,
} from "./container";

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

export type DecryptFailure = ContainerFailure | "wrongPasswordOrDamaged";

/**
 * Decrypt the journal at `path` into `outputPath`, which receives the
 * plaintext `.tar.gz`. Returns null on success, or why it failed.
 *
 * A 7.1 container (see `openContainer`) tells a wrong password, damage, and a
 * newer format apart, and other errors from it, such as I/O failures, are
 * thrown. A legacy 5.1 or 7.0 file cannot tell them apart, so any failure
 * there, I/O included, is `wrongPasswordOrDamaged`. Either way the file is
 * streamed, so a journal of any size decrypts in bounded memory.
 */
export const decryptFile = async (
    path: string,
    outputPath: string,
    key: string,
): Promise<DecryptFailure | null> => {
    if (await isContainer(path)) {
        try {
            await pipeline(
                await openContainer(path, key),
                fs.createWriteStream(outputPath),
            );
            return null;
        } catch (error) {
            if (error instanceof ContainerError) return error.failure;
            throw error;
        }
    }

    try {
        const header = Buffer.alloc(SALT_LENGTH + IV_LENGTH);
        const file = await fs.promises.open(path);
        const { bytesRead } = await file.read(header, 0, header.length, 0);
        await file.close();

        if (bytesRead < header.length) return "wrongPasswordOrDamaged";

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
        return "wrongPasswordOrDamaged";
    }
};
