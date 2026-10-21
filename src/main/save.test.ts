import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decompress } from "./archive";
import { decryptFile } from "./encryption";
import { saveJournal } from "./save";

import type { JournalData } from "../shared/journal";

let root: string;
let sessionRoot: string;
let imagesDir: string;
let filePath: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "jb-save-"));
    sessionRoot = join(root, "session");
    imagesDir = join(sessionRoot, "files", "images");
    mkdirSync(imagesDir, { recursive: true });
    writeFileSync(join(imagesDir, "clip.mp4"), "video bytes");
    filePath = join(root, "My Journal.journal");
});

afterEach(() => {
    rmSync(root, { recursive: true });
});

function journal(content: string, attachments: string[] = []): JournalData {
    return {
        version: 7,
        entries: [
            {
                entryDate: "2026-06-14T16:00:00.000Z",
                content,
                sentiment: "Happy",
                attachments,
            },
        ],
    };
}

function save(journalData: JournalData) {
    return saveJournal({
        filePath,
        password: "pw",
        journalData,
        sessionRoot,
        imagesDir,
    });
}

async function reopenedContent(): Promise<string> {
    const archivePath = join(root, "reopened.tar.gz");
    const extracted = join(root, "reopened");

    expect(await decryptFile(filePath, archivePath, "pw")).toBeNull();
    await decompress(archivePath, extracted);

    return JSON.parse(readFileSync(join(extracted, "data.json"), "utf8"))
        .entries[0].content;
}

function expectNoScratchFiles() {
    expect(readdirSync(sessionRoot)).toEqual(["files"]);
    expect(existsSync(join(root, ".My Journal.journal.saving"))).toBe(false);
}

describe("saveJournal", () => {
    it("runs overlapping saves one after another", async () => {
        const results = await Promise.all([
            save(journal("first", ["journalbear://attachments/clip.mp4"])),
            save(journal("second")),
        ]);

        expect(results).toEqual([{ success: true }, { success: true }]);
        expect(await reopenedContent()).toBe("second");
        expectNoScratchFiles();
    });

    it("leaves the previous journal intact when a save fails", async () => {
        expect(
            await save(journal("kept", ["journalbear://attachments/clip.mp4"])),
        ).toEqual({ success: true });

        const failed = await save(
            journal("lost", ["journalbear://attachments/missing.mp4"]),
        );

        expect(failed.success).toBe(false);
        expect(await reopenedContent()).toBe("kept");
        expectNoScratchFiles();
    });

    it("keeps saving after a save that couldn't start", async () => {
        rmSync(sessionRoot, { recursive: true });
        expect((await save(journal("lost"))).success).toBe(false);

        mkdirSync(imagesDir, { recursive: true });
        expect(await save(journal("saved"))).toEqual({ success: true });
        expect(await reopenedContent()).toBe("saved");
    });
});
