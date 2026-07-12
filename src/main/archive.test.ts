import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { compress, decompress } from "./archive";

describe("archive", () => {
    it("compress produces a .tar.gz file on disk", async () => {
        const dir = mkdtempSync(join(tmpdir(), "jb-arc-"));
        writeFileSync(join(dir, "data.json"), '{"version":7,"entries":[]}');

        const archivePath = await compress(dir);
        expect(archivePath).toMatch(/\.tar\.gz$/);
        expect(existsSync(archivePath)).toBe(true);
    });

    it("round-trips directory contents at the archive root", async () => {
        // Regression: compress must pack the directory's *contents* (data.json,
        // images/) at the root, not the absolute directory path. Otherwise
        // extraction yields a nested var/folders/... tree and the read path
        // can't find data.json.
        const dir = mkdtempSync(join(tmpdir(), "jb-arc-"));
        const json = '{"version":7,"entries":[{"content":"hi"}]}';
        writeFileSync(join(dir, "data.json"), json);

        const archivePath = await compress(dir);
        await expect(decompress(archivePath)).resolves.toBeUndefined();

        const extracted = join(tmpdir(), "_jbfiles", "data.json");
        expect(existsSync(extracted)).toBe(true);
        expect(readFileSync(extracted, "utf8")).toBe(json);
    });

    it("decompress starts from a clean directory on repeated calls", async () => {
        const dir = mkdtempSync(join(tmpdir(), "jb-arc-"));
        writeFileSync(join(dir, "data.json"), '{"version":7,"entries":[]}');
        const archivePath = await compress(dir);

        // A stale _jbfiles from a prior open must not cause EEXIST or leak files.
        await decompress(archivePath);
        await expect(decompress(archivePath)).resolves.toBeUndefined();
        expect(existsSync(join(tmpdir(), "_jbfiles", "data.json"))).toBe(true);
    });
});
