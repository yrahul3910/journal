const { app, BrowserWindow } = require("electron");
const rimraf = require("rimraf");
const os = require("os");
const path = require("path");
const url = require("url");

// Keep a global reference of the window object, if you don"t, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;

function createWindow() {
    // Create the browser window.
    win = new BrowserWindow({ width: 800, height: 650 });
    //win.webContents.openDevTools();
    // and load the index.html of the app.
    win.loadURL(url.format({
        pathname: path.join(__dirname, "index.html"),
        protocol: "file:",
        slashes: true,
    }));
    win.setTitle("JournalBear 5.0");
    win.setMenu(null);
    win.setMaximizable(false);
    win.setResizable(false);

    win.webContents.on("new-window", (e, url) => {
        e.preventDefault();
        require("electron").shell.openExternal(url);
    });

    // Emitted when the window is closed.
    win.on("closed", () => {
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
    createWindow();

    // Perform cleanup after the user can see the window
    let tmp = os.tmpdir();
    rimraf(tmp + "\\_jbimages", (err) => {
        if (err) throw err;

        rimraf(tmp + "/_jbfiles", (err) => {
            if (err) throw err;

            rimraf(tmp + "/_jb.tar.gz", (err) => {
                if (err) throw err;
            });
        });
    });
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
