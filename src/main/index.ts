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

// Read an image file referenced by a 7.0 attachment path and return it as a
// data: URL for the renderer. Returns null if the file is missing so the caller
// can drop the reference. B (file-serving over a protocol) will replace this.
function loadImageAsDataUrl(imagesDir: string, ref: string): string | null {
    const filename = ref.split("/").pop();
    if (!filename) return null;

    const fullPath = path.join(imagesDir, filename);
    if (!fs.existsSync(fullPath)) {
        console.warn(`[DECRYPT] Image not found: ${fullPath}`);
        return null;
    }

    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeType =
        ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
    return `data:${mimeType};base64,${fs.readFileSync(fullPath).toString("base64")}`;
}

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
                                : loadImageAsDataUrl(imagesDir, att),
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

            // Write image attachments and update attachment field to use file paths
            journalData.entries.forEach((entry: any) => {
                if (entry.attachments && entry.attachments.length > 0) {
                    const filePaths: string[] = [];
                    entry.attachments.forEach((img: string, imgIdx: number) => {
                        // TODO: This seems wrong, it should probably also check for file path strings
                        // instead of declaring everything as a PNG

                        // Determine file extension from data URL
                        const isJpeg = img.includes("data:image/jpeg");
                        const ext = isJpeg ? "jpg" : "png";

                        // Use timestamp-based naming for better compatibility
                        const timestamp = entry.entryDate || Date.now();
                        const filename = `${timestamp}_${imgIdx}.${ext}`;
                        const filePath = `./_jbfiles/images/${filename}`;

                        // Save image file
                        const buffer = Buffer.from(
                            img.replace(/^data:image\/\w+;base64,/, ""),
                            "base64",
                        );
                        fs.writeFileSync(
                            `${tmp}/_jbfiles/images/${filename}`,
                            buffer,
                        );

                        // Store file path for JSON
                        filePaths.push(filePath);
                    });

                    // Update attachment to use file paths instead of data URLs
                    entry.attachments = filePaths;
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
