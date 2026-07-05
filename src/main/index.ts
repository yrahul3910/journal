import fs from "fs";
import os from "os";
import path from "path";

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { rimraf } from "rimraf";
import { z } from "zod";

import {
    JournalData,
    JournalData51Schema,
    JournalDataSchema,
    JournalEntry,
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
                console.log(
                    `[DECRYPT] Looking for journal.json in: ${tmp}/_jbfiles`,
                );

                // Check if the directory exists and list its contents
                if (fs.existsSync(`${tmp}/_jbfiles`)) {
                    const files = fs.readdirSync(`${tmp}/_jbfiles`);
                    console.log("[DECRYPT] Files in _jbfiles:", files);
                } else {
                    console.log("[DECRYPT] _jbfiles directory does not exist!");
                }

                const journalPath = tmp + "/_jbfiles/data.json";

                console.log("[DECRYPT] Reading journal from:", journalPath);
                const rawContents = JSON.parse(
                    fs.readFileSync(journalPath, "utf8"),
                );

                const v7Result = z.safeParse(JournalDataSchema, rawContents);
                const data: JournalData = v7Result.success
                    ? v7Result.data
                    : migrate51to70(z.parse(JournalData51Schema, rawContents));

                // Load image attachments from images directory
                const imagesDir = `${tmp}/_jbfiles/images`;
                console.log(
                    "[DECRYPT] Checking for images directory:",
                    imagesDir,
                );
                console.log(
                    "[DECRYPT] Images directory exists:",
                    fs.existsSync(imagesDir),
                );

                if (fs.existsSync(imagesDir)) {
                    let count = 0;
                    data.entries.forEach((entry: JournalEntry, idx: number) => {
                        if (entry.attachments) {
                            const images: string[] = [];

                            // Handle single string attachment
                            if (typeof entry.attachments === "string") {
                                // Check if it's already a data URL
                                if (
                                    entry.attachments.startsWith("data:image/")
                                ) {
                                    images.push(entry.attachments);
                                } else if (
                                    entry.attachments.startsWith("/9j/")
                                ) {
                                    // Raw JPEG base64 - add prefix
                                    images.push(
                                        "data:image/jpeg;base64," +
                                            entry.attachments,
                                    );
                                } else if (
                                    entry.attachments.startsWith("iVBOR")
                                ) {
                                    // Raw PNG base64 - add prefix
                                    images.push(
                                        "data:image/png;base64," +
                                            entry.attachments,
                                    );
                                } else {
                                    // Assume JPEG if we can't detect
                                    images.push(
                                        "data:image/jpeg;base64," +
                                            entry.attachments,
                                    );
                                }
                                console.log(
                                    `[DECRYPT] Entry ${idx} converted single string attachment`,
                                );
                                entry.attachments = images;
                            } else if (
                                Array.isArray(entry.attachments) &&
                                entry.attachments.length > 0
                            ) {
                                // Check if attachment contains paths or is already base64
                                const firstItem = entry.attachments[0];
                                if (
                                    typeof firstItem === "string" &&
                                    firstItem.includes("/_jbfiles/")
                                ) {
                                    // It's a path - load the actual files
                                    entry.attachments.forEach(
                                        (filePath: string) => {
                                            // Convert relative path to absolute
                                            const filename = filePath
                                                .split("/")
                                                .pop(); // Get just the filename
                                            const fullPath =
                                                tmp +
                                                "/_jbfiles/images/" +
                                                filename;
                                            console.log(
                                                `[DECRYPT] Loading image from path: ${fullPath}`,
                                            );

                                            if (fs.existsSync(fullPath)) {
                                                const imgBuffer =
                                                    fs.readFileSync(fullPath);
                                                // Detect image type from extension
                                                const ext = filename
                                                    ?.split(".")
                                                    .pop()
                                                    ?.toLowerCase();
                                                const mimeType =
                                                    ext === "jpg" ||
                                                    ext === "jpeg"
                                                        ? "image/jpeg"
                                                        : "image/png";
                                                const base64 =
                                                    `data:${mimeType};base64,` +
                                                    imgBuffer.toString(
                                                        "base64",
                                                    );
                                                console.log(
                                                    `[DECRYPT] Loaded image ${filename}, size: ${imgBuffer.length} bytes`,
                                                );
                                                images.push(base64);
                                            } else {
                                                console.log(
                                                    `[DECRYPT] Image not found: ${fullPath}`,
                                                );
                                            }
                                        },
                                    );
                                } else if (
                                    typeof entry.attachments === "number" ||
                                    (Array.isArray(entry.attachments) &&
                                        typeof entry.attachments[0] ===
                                            "number")
                                ) {
                                    // It's a count - try the old naming pattern
                                    const count =
                                        typeof entry.attachments === "number"
                                            ? entry.attachments
                                            : entry.attachments.length;
                                    for (
                                        let imgIdx = 0;
                                        imgIdx < count;
                                        imgIdx++
                                    ) {
                                        const filename = `${idx}_${imgIdx}.png`;
                                        const imgPath = `${imagesDir}/${filename}`;
                                        if (fs.existsSync(imgPath)) {
                                            const imgBuffer =
                                                fs.readFileSync(imgPath);
                                            const base64 =
                                                "data:image/png;base64," +
                                                imgBuffer.toString("base64");
                                            images.push(base64);
                                        }
                                    }
                                }

                                console.log(
                                    `[DECRYPT] Entry ${idx} loaded ${images.length} images`,
                                );
                                entry.attachments = images;
                            }
                        }
                    });

                    console.log(
                        `${count} entries with string value for "attachments".`,
                    );
                } else {
                    console.log("[DECRYPT] No images directory found");
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
