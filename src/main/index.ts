import fs from "fs";
import os from "os";
import path from "path";

import { app, BrowserWindow, dialog, ipcMain, protocol } from "electron";
import { rimraf } from "rimraf";
import { z } from "zod";

import {
    type JournalData,
    JournalData51Schema,
    JournalDataSchema,
    migrate51to70,
} from "../shared/journal";
import * as archive from "./archive";
import {
    ATTACHMENT_SCHEME,
    exportAttachments,
    importAttachment,
    resolveAttachment,
    serveAttachment,
} from "./attachments";
import * as encryption from "./encryption";
import { saveJournal } from "./save";

let mainWindow: BrowserWindow | null = null;

// This process's scratch space for the open journal's decrypted files, which
// the renderer loads through the attachment scheme while the journal is open.
// Each process gets its own, so a second app instance can't delete them, and
// the pid in the name lets a later launch clean up after a crash.
const SESSION_PREFIX = "_jbsession-";
const sessionRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), `${SESSION_PREFIX}${process.pid}-`),
);
const sessionFilesDir = path.join(sessionRoot, "files");
const sessionImagesDir = path.join(sessionFilesDir, "images");

// `stream` lets <video> read the files progressively instead of buffering
// them whole.
protocol.registerSchemesAsPrivileged([
    {
        scheme: ATTACHMENT_SCHEME,
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            stream: true,
        },
    },
]);

function createWindow() {
    console.log("[MAIN] Creating window...");
    console.log("[MAIN] __dirname:", __dirname);
    console.log(
        "[MAIN] Preload path:",
        path.join(__dirname, "../preload/index.js"),
    );

    mainWindow = new BrowserWindow({
        width: 1000,
        height: 768,
        minWidth: 800,
        minHeight: 600,
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, "../preload/index.js"),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
        },
    });

    console.log("[MAIN] Window created");

    // In development, load from vite dev server
    if (!app.isPackaged) {
        console.log("[MAIN] Loading dev server...");
        mainWindow.loadURL("http://localhost:5173");
        mainWindow.webContents.openDevTools();
    } else {
        console.log("[MAIN] Loading production build...");
        mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
    }

    mainWindow.setTitle("JournalBear");
    mainWindow.setMenu(null);

    mainWindow.webContents.on("did-finish-load", () => {
        console.log("[MAIN] Page loaded");
    });

    mainWindow.webContents.on("console-message", (_event, _level, message) => {
        console.log(`[RENDERER] ${message}`);
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

// IPC Handlers

// Window controls
ipcMain.on("minimize-window", () => {
    mainWindow?.minimize();
});

ipcMain.on("maximize-window", () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow?.maximize();
    }
});

ipcMain.on("close-window", () => {
    mainWindow?.close();
});

// File operations
ipcMain.handle("open-file-dialog", async () => {
    console.log("[MAIN] Opening file dialog...");
    const result = await dialog.showOpenDialog({
        filters: [
            { name: "JournalBear 5.1 Document", extensions: ["zjournal"] },
            { name: "JournalBear 7.0 Document", extensions: ["journal"] },
        ],
    });

    if (result.canceled || !result.filePaths) {
        return null;
    }

    const filePath = result.filePaths[0];
    const fileVersion = filePath.endsWith("zjournal") ? 5.1 : 7.0;

    return {
        filePath,
        fileVersion,
    };
});

ipcMain.handle("save-file-dialog", async () => {
    const result = await dialog.showSaveDialog({
        filters: [
            { name: "JournalBear 7.0 Document", extensions: ["journal"] },
        ],
    });

    if (result.canceled || !result.filePath) {
        return null;
    }

    return result.filePath;
});

ipcMain.handle(
    "decrypt-journal",
    async (_event, args: { filePath: string; password: string }) => {
        const { filePath, password } = args;
        const archivePath = path.join(sessionRoot, "journal.tar.gz");

        try {
            // decrypt -> decompress -> read JSON
            const err = await encryption.decryptFile(
                filePath,
                archivePath,
                password,
            );
            if (err) {
                return new Error("Wrong password or corrupted file");
            }

            await archive.decompress(archivePath, sessionFilesDir);

            try {
                const journalPath = path.join(sessionFilesDir, "data.json");
                const rawContents = JSON.parse(
                    fs.readFileSync(journalPath, "utf8"),
                );

                const v7Result = z.safeParse(JournalDataSchema, rawContents);
                const data: JournalData = v7Result.success
                    ? v7Result.data
                    : migrate51to70(z.parse(JournalData51Schema, rawContents));

                // The schema guarantees attachments is string[]. Each item is
                // either an inline data: URL (from a migrated 5.1 journal) or a
                // path into images/ (the 7.0 on-disk form). Resolve every path
                // to the attachment URL the renderer loads the file from.
                for (const entry of data.entries) {
                    entry.attachments = entry.attachments
                        .map((att) =>
                            att.startsWith("data:")
                                ? att
                                : resolveAttachment(sessionImagesDir, att),
                        )
                        .filter((att): att is string => att !== null);
                }

                return { success: true, data };
            } catch (readErr) {
                console.error("[DECRYPT] Error reading journal:", readErr);
                return new Error("Failed to read journal data");
            }
        } catch (err) {
            return { success: false, error: (err as Error).message };
        } finally {
            fs.rmSync(archivePath, { force: true });
        }
    },
);

ipcMain.handle(
    "save-journal",
    (
        _event,
        args: { filePath: string; password: string; journalData: JournalData },
    ) =>
        saveJournal({
            ...args,
            sessionRoot,
            imagesDir: sessionImagesDir,
        }),
);

ipcMain.handle("export-html", async (_event, args: { html: string }) => {
    const result = await dialog.showSaveDialog({
        filters: [{ name: "HTML", extensions: ["html"] }],
    });

    if (result.canceled || !result.filePath) {
        return { success: false };
    }

    try {
        fs.writeFileSync(
            result.filePath,
            await exportAttachments(
                args.html,
                sessionImagesDir,
                result.filePath,
            ),
        );
        return { success: true, filePath: result.filePath };
    } catch (err) {
        return { success: false, error: (err as Error).message };
    }
});

ipcMain.handle("import-attachment", (_event, sourcePath: string) =>
    importAttachment(sourcePath, sessionImagesDir),
);

ipcMain.handle("save-image-dialog", async () => {
    const result = await dialog.showOpenDialog({
        title: "Choose a folder",
        properties: ["openDirectory"],
    });

    if (result.canceled || !result.filePaths) {
        return null;
    }

    return result.filePaths[0];
});

ipcMain.handle("check-password-strength", async (_event, password: string) => {
    return encryption.checkPasswordStrength(password);
});

// Remove decrypted journal content left in the temp directory by processes
// that are gone: the fixed paths older versions used, and session folders
// whose process no longer runs (after a crash).
function removeStaleTempFiles() {
    const tmp = os.tmpdir();
    console.log("[MAIN] Cleaning up temp directory:", tmp);
    try {
        rimraf.sync(`${tmp}/_jbimages`);
        rimraf.sync(`${tmp}/_jbfiles`);
        rimraf.sync(`${tmp}/_jb.tar.gz`);

        for (const name of fs.readdirSync(tmp)) {
            const pid = name.startsWith(SESSION_PREFIX)
                ? Number(name.slice(SESSION_PREFIX.length).split("-")[0])
                : null;
            if (pid && !isRunning(pid)) rimraf.sync(path.join(tmp, name));
        }

        console.log("[MAIN] Cleanup complete");
    } catch (err) {
        console.error("[MAIN] Cleanup error:", err);
    }
}

function isRunning(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        // EPERM means the process exists but belongs to another user.
        return (
            error instanceof Error && "code" in error && error.code === "EPERM"
        );
    }
}

// App lifecycle
app.whenReady().then(() => {
    console.log("[MAIN] App ready");
    removeStaleTempFiles();
    protocol.handle(ATTACHMENT_SCHEME, (request) =>
        serveAttachment(request, sessionImagesDir),
    );
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("will-quit", () => rimraf.sync(sessionRoot));

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
