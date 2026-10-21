import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { compress, decompress } from "./archive";

describe("archive", () => {
    it("compress produces a .tar.gz file on disk", async () => {
        const dir = mkdtempSync(join(tmpdir(), "jb-arc-"));
        writeFileSync(join(dir, "data.json"), '{"version":7,"entries":[]}');

        const archivePath = join(
            mkdtempSync(join(tmpdir(), "jb-arc-")),
            "out.tar.gz",
        );

        await compress(dir, archivePath);
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

        const out = mkdtempSync(join(tmpdir(), "jb-arc-"));
        const archivePath = join(out, "out.tar.gz");

        await compress(dir, archivePath);
        await expect(
            decompress(archivePath, join(out, "files")),
        ).resolves.toBeUndefined();

        const extracted = join(out, "files", "data.json");
        expect(existsSync(extracted)).toBe(true);
        expect(readFileSync(extracted, "utf8")).toBe(json);
    });

    it("decompress starts from a clean directory on repeated calls", async () => {
        const dir = mkdtempSync(join(tmpdir(), "jb-arc-"));
        writeFileSync(join(dir, "data.json"), '{"version":7,"entries":[]}');
        const out = mkdtempSync(join(tmpdir(), "jb-arc-"));
        const archivePath = join(out, "out.tar.gz");
        const files = join(out, "files");
        await compress(dir, archivePath);

        // Files from a previously opened journal must not cause EEXIST or leak.
        await decompress(archivePath, files);
        writeFileSync(join(files, "stale.jpg"), "old");
        await expect(decompress(archivePath, files)).resolves.toBeUndefined();
        expect(existsSync(join(files, "data.json"))).toBe(true);
        expect(existsSync(join(files, "stale.jpg"))).toBe(false);
    });
});
