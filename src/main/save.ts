import fs from "node:fs";
import path from "node:path";

import { rimraf } from "rimraf";

import { VERSION_NUMBER } from "../shared/constants";
import * as archive from "./archive";
import { stageAttachment } from "./attachments";
import { sealContainer, verifyContainer } from "./container";

import type { JournalData } from "../shared/journal";

interface SaveRequest {
    filePath: string;
    password: string;
    journalData: JournalData;
    // Holds this process's scratch files; each save stages in its own
    // folder inside it.
    sessionRoot: string;
    // Where the open journal's attachment files live.
    imagesDir: string;
}

// The save that runs last; every new save waits for it.
let latestSave: Promise<unknown> = Promise.resolve();

/**
 * Encrypt `journalData` with its attachment files into `filePath`.
 *
 * Saves run one at a time in the order they are requested, since two saves
 * encrypting into the same file at once would interleave their bytes. The
 * journal is written beside `filePath` as format 7.1, reopened to verify it,
 * and only then renamed over it, so a save that fails leaves the previous
 * version intact. Plaintext copies are removed whether or not the save
 * succeeds. Resolves to the outcome; it rejects only if removing those copies
 * fails, and a rejected save doesn't hold up the saves queued after it.
 */
export function saveJournal(
    request: SaveRequest,
): Promise<{ success: boolean; error?: string }> {
    const save = latestSave
        .catch(() => undefined)
        .then(() => writeJournal(request));
    latestSave = save;

    return save;
}

async function writeJournal({
    filePath,
    password,
    journalData,
    sessionRoot,
    imagesDir,
}: SaveRequest): Promise<{ success: boolean; error?: string }> {
    const encryptedPath = path.join(
        path.dirname(filePath),
        `.${path.basename(filePath)}.saving`,
    );
    let saveDir: string | undefined;

    try {
        saveDir = await fs.promises.mkdtemp(path.join(sessionRoot, "save-"));
        const stagingDir = path.join(saveDir, "journal");
        const stagingImagesDir = path.join(stagingDir, "images");
        const archivePath = path.join(saveDir, "journal.tar.gz");

        await fs.promises.mkdir(stagingImagesDir, { recursive: true });

        // Copy each attachment into images/ and store its path in place of
        // the in-memory URL.
        for (const entry of journalData.entries) {
            // Use timestamp-based naming for better compatibility
            const timestamp = entry.entryDate || Date.now();
            entry.attachments = await Promise.all(
                entry.attachments.map((attachment, index) =>
                    stageAttachment(
                        attachment,
                        imagesDir,
                        stagingImagesDir,
                        `${timestamp}_${index}`,
                    ),
                ),
            );
        }

        // The writer, not the renderer's state, decides the format version.
        journalData.version = VERSION_NUMBER;
        await fs.promises.writeFile(
            path.join(stagingDir, "data.json"),
            JSON.stringify(journalData),
        );
        await archive.compress(stagingDir, archivePath);
        const plaintextHash = await sealContainer(
            archivePath,
            encryptedPath,
            password,
        );
        await verifyContainer(encryptedPath, password, plaintextHash);
        await fs.promises.rename(encryptedPath, filePath);

        return { success: true };
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
        };
    } finally {
        if (saveDir) await rimraf(saveDir);
        await fs.promises.rm(encryptedPath, { force: true });
    }
}
