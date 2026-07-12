import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
    getEncryptedText,
    getDecryptedText,
    checkPasswordStrength,
    encryptFile,
    decryptFile,
} from "./encryption";

describe("text encryption", () => {
    it("round-trips text through encrypt -> decrypt", () => {
        const secret = "Dear diary, today was a good day. 🌞";
        const encrypted = getEncryptedText(secret, "hunter2");
        expect(getDecryptedText(encrypted, "hunter2")).toBe(secret);
    });

    it("emits salt:iv:ciphertext with 16-byte salt and IV as hex", () => {
        const parts = getEncryptedText("x", "pw").split(":");
        expect(parts).toHaveLength(3);
        expect(parts[0]).toMatch(/^[0-9a-f]{32}$/); // 16-byte salt
        expect(parts[1]).toMatch(/^[0-9a-f]{32}$/); // 16-byte IV
        expect(parts[2].length).toBeGreaterThan(0);
    });

    it("uses a fresh salt/IV per call, so ciphertext is non-deterministic", () => {
        expect(getEncryptedText("same", "pw")).not.toBe(
            getEncryptedText("same", "pw"),
        );
    });

    it("returns undefined for the wrong password", () => {
        const encrypted = getEncryptedText("secret", "correct-horse");
        expect(getDecryptedText(encrypted, "wrong-horse")).toBeUndefined();
    });

    it("returns undefined for malformed ciphertext", () => {
        expect(getDecryptedText("not-a-valid-blob", "pw")).toBeUndefined();
    });
});

describe("checkPasswordStrength", () => {
    it("accepts a strong password with no errors", () => {
        expect(checkPasswordStrength("Str0ng!Passphrase")).toEqual([]);
    });

    it("reports errors for a too-short password", () => {
        expect(checkPasswordStrength("a1B!").length).toBeGreaterThan(0);
    });
});

describe("file encryption", () => {
    const dir = mkdtempSync(join(tmpdir(), "jb-enc-"));

    it("round-trips a file through encryptFile -> decryptFile", async () => {
        const input = join(dir, "plain.txt");
        const cipher = join(dir, "cipher.bin");
        const output = join(dir, "plain.out.txt");
        const content = "the quick brown fox\n".repeat(100);
        writeFileSync(input, content);

        await encryptFile(input, cipher, "key");
        expect(decryptFile(cipher, output, "key")).toBeNull();
        expect(readFileSync(output, "utf8")).toBe(content);
    });

    it("resolves only after the encrypted file is fully written", async () => {
        const input = join(dir, "sync.txt");
        const cipher = join(dir, "sync.bin");
        writeFileSync(input, "hello world");

        // Contract: the promise resolves after the output stream finishes, so
        // the file is fully written (salt + IV + ciphertext) once we await it.
        await encryptFile(input, cipher, "key");
        expect(existsSync(cipher)).toBe(true);
        expect(readFileSync(cipher).length).toBeGreaterThan(16 + 16);
    });
});
