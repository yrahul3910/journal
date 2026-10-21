import fs from "fs";
import os from "os";
import path from "path";

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { rimraf } from "rimraf";
import { z } from "zod";

import {
    type JournalData,
    JournalData51Schema,
    JournalDataSchema,
    migrate51to70,
} from "../shared/journal";
import * as archive from "./archive";
import { readAttachment, writeAttachment } from "./attachments";
import * as encryption from "./encryption";

let mainWindow: BrowserWindow | null = null;

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
    const encryptedData = fs.readFileSync(filePath).toString();

    return {
        filePath,
        fileVersion,
        encryptedData,
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
        const tmp = os.tmpdir();

        try {
            // decrypt -> decompress -> read JSON
            const err = encryption.decryptFile(
                filePath,
                `${tmp}//_jb.tar.gz`,
                password,
            );
            if (err) {
                return new Error("Wrong password or corrupted file");
            }

            await archive.decompress(`${tmp}/_jb.tar.gz`);

            try {
                const journalPath = `${tmp}/_jbfiles/data.json`;
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
                // to a data: URL so the renderer only ever sees data: URLs.
                const imagesDir = `${tmp}/_jbfiles/images`;
                for (const entry of data.entries) {
                    entry.attachments = entry.attachments
                        .map((att) =>
                            att.startsWith("data:")
                                ? att
                                : readAttachment(imagesDir, att),
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
        }
    },
);

ipcMain.handle(
    "save-journal",
    async (
        _event,
        args: { filePath: string; password: string; journalData: any },
    ) => {
        const { filePath, password, journalData } = args;
        const tmp = os.tmpdir();

        try {
            // Clean up temp directories
            await rimraf(`${tmp}/_jbimages`);
            await rimraf(`${tmp}/_jbfiles`);
            await rimraf(`${tmp}/_jb.tar.gz`);

            // Create temp directories
            fs.mkdirSync(`${tmp}/_jbfiles`, { recursive: true });
            fs.mkdirSync(`${tmp}/_jbimages`, { recursive: true });

            // Create images directory inside _jbfiles
            fs.mkdirSync(`${tmp}/_jbfiles/images`, { recursive: true });

            // Write each attachment into images/ and store its path in place
            // of the in-memory data: URL.
            journalData.entries.forEach((entry: any) => {
                if (entry.attachments && entry.attachments.length > 0) {
                    // Use timestamp-based naming for better compatibility
                    const timestamp = entry.entryDate || Date.now();
                    entry.attachments = entry.attachments.map(
                        (attachment: string, index: number) =>
                            writeAttachment(
                                `${tmp}/_jbfiles/images`,
                                `${timestamp}_${index}`,
                                attachment,
                            ),
                    );
                }
            });

            // Write journal JSON with updated attachment paths
            fs.writeFileSync(
                tmp + "/_jbfiles/data.json",
                JSON.stringify(journalData),
            );

            // Compress
            const archivePath = await archive.compress(`${tmp}/_jbfiles`);
            if (!archivePath) {
                return { success: false, error: "Failed to compress journal" };
            }

            // Encrypt
            await encryption.encryptFile(archivePath, filePath, password);

            return { success: true };
        } catch (err) {
            return { success: false, error: (err as Error).message };
        }
    },
);

ipcMain.handle("export-html", async (_event, args: { html: string }) => {
    const result = await dialog.showSaveDialog({
        filters: [{ name: "HTML", extensions: ["html"] }],
    });

    if (result.canceled || !result.filePath) {
        return { success: false };
    }

    try {
        fs.writeFileSync(result.filePath, args.html);
        return { success: true, filePath: result.filePath };
    } catch (err) {
        return { success: false, error: (err as Error).message };
    }
});

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

// App lifecycle
app.whenReady().then(() => {
    console.log("[MAIN] App ready");
    createWindow();

    // Perform cleanup
    const tmp = os.tmpdir();
    console.log("[MAIN] Cleaning up temp directory:", tmp);
    try {
        rimraf.sync(tmp + "/_jbimages");
        rimraf.sync(`${tmp}/_jbfiles`);
        rimraf.sync(tmp + "/_jb.tar.gz");
        console.log("[MAIN] Cleanup complete");
    } catch (err) {
        console.error("[MAIN] Cleanup error:", err);
    }

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
