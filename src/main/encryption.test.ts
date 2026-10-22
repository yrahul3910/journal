import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { sealContainer } from "./container";
import {
    checkPasswordStrength,
    decryptFile,
    getDecryptedText,
    getEncryptedText,
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

describe("decryptFile", () => {
    const dir = mkdtempSync(join(tmpdir(), "jb-enc-"));

    it("opens a legacy 7.0 journal and reports any failure as either cause", async () => {
        const fixture = fileURLToPath(
            new URL(
                "../../swiftui/JournalBearTests/Fixtures/test_journal.zjournal",
                import.meta.url,
            ),
        );
        const output = join(dir, "legacy.tar.gz");

        expect(await decryptFile(fixture, output, "$Password123")).toBeNull();
        expect(readFileSync(output).subarray(0, 2)).toEqual(
            Buffer.from([0x1f, 0x8b]), // gzip magic
        );
        expect(await decryptFile(fixture, output, "wrong")).toBe(
            "wrongPasswordOrDamaged",
        );
    });

    it("opens a 7.1 journal and reports a wrong password as such", async () => {
        const archive = join(dir, "archive.tar.gz");
        const journal = join(dir, "journal.zjournal");
        const output = join(dir, "reopened.tar.gz");
        writeFileSync(archive, "archive bytes");
        await sealContainer(archive, journal, "key");

        expect(await decryptFile(journal, output, "key")).toBeNull();
        expect(readFileSync(output, "utf8")).toBe("archive bytes");
        expect(await decryptFile(journal, output, "wrong key")).toBe(
            "wrongPassword",
        );
    }, 30_000);
});
