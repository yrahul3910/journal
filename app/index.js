import { app, BrowserWindow } from "electron";
import { rimraf } from "rimraf";
import os from "os";
import path from "path";
import url from "url";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { initialize, enable } from "@electron/remote/main/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Keep a global reference of the window object, if you don"t, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;

function createWindow() {
    console.log("[MAIN] Creating window...");
    // Create the browser window.
    win = new BrowserWindow({ 
        width: 1000, 
        height: 700,
        minWidth: 800,
        minHeight: 600,
        frame: false, 
        icon: __dirname + "/../build/logo.png",
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        }
    });
    
    // Enable @electron/remote
    console.log("[MAIN] Initializing remote module...");
    initialize();
    enable(win.webContents);
    
    // and load the index.html of the app.
    const indexPath = path.join(__dirname, "index.html");
    console.log("[MAIN] Loading index.html from:", indexPath);
    win.loadURL(url.format({
        pathname: indexPath,
        protocol: "file:",
        slashes: true,
    }));
    win.setTitle("JournalBear");
    win.setMenu(null);
    win.setMaximizable(true);
    win.setResizable(true);
    win.openDevTools();

    win.webContents.setWindowOpenHandler(async ({ url: externalUrl }) => {
        console.log("[MAIN] Opening external URL:", externalUrl);
        const { shell } = await import("electron");
        shell.openExternal(externalUrl);
        return { action: "deny" };
    });

    // Emitted when the window is closed.
    win.on("closed", () => {
        console.log("[MAIN] Window closed");
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        win = null;
    });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", () => {
    console.log("[MAIN] App ready");
    createWindow();

    // Perform cleanup after the user can see the window
    let tmp = os.tmpdir();
    console.log("[MAIN] Cleaning up temp directory:", tmp);
    try {
        rimraf.sync(tmp + "/_jbimages");
        rimraf.sync(tmp + "/_jbfiles");
        rimraf.sync(tmp + "/_jb.tar.gz");
        console.log("[MAIN] Cleanup complete");
    } catch (err) {
        console.error("[MAIN] Cleanup error:", err);
    }
});

// Quit when all windows are closed.
app.on("window-all-closed", () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    // On macOS it"s common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow();
    }
});
