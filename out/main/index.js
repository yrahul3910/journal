import { ipcMain, dialog, app, BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";
import { rimraf } from "rimraf";
import crypto from "crypto";
import owasp from "owasp-password-strength-test";
import tar from "targz";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const algorithm = "aes-256-cbc";
const SALT_LENGTH = 16;
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const deriveKey = (password, salt) => {
  return crypto.pbkdf2Sync(password, salt, 1e5, KEY_LENGTH, "sha256");
};
const getDecryptedText = (text, pwd) => {
  try {
    const parts = text.split(":");
    if (parts.length === 1) {
      const evpBytesToKey = (password, keyLen, ivLen) => {
        const buffers = [];
        let prev;
        let total = 0;
        while (total < keyLen + ivLen) {
          const hash = crypto.createHash("md5");
          if (prev) {
            hash.update(prev);
          }
          hash.update(password);
          prev = hash.digest();
          buffers.push(prev);
          total += prev.length;
        }
        const result = Buffer.concat(buffers);
        return {
          key: result.slice(0, keyLen),
          iv: result.slice(keyLen, keyLen + ivLen)
        };
      };
      const { key: key2, iv: iv2 } = evpBytesToKey(pwd, 32, 16);
      const decipher2 = crypto.createDecipheriv("aes-256-cbc", key2, iv2);
      return decipher2.update(text, "hex", "utf8") + decipher2.final("utf8");
    }
    const salt = Buffer.from(parts[0], "hex");
    const iv = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];
    const key = deriveKey(pwd, salt);
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    return decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");
  } catch (ex) {
    console.error("[ENCRYPTION] Decryption error:", ex);
    return void 0;
  }
};
const checkPasswordStrength = (pwd) => {
  owasp.config({
    minLength: 8
  });
  const result = owasp.test(pwd);
  if (result.errors) return result.errors;
  else return [];
};
const encryptFile = (path2, outputPath, key, func) => {
  try {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const derivedKey = deriveKey(key, salt);
    const cipher = crypto.createCipheriv(algorithm, derivedKey, iv);
    const input = fs.createReadStream(path2);
    const output = fs.createWriteStream(outputPath);
    output.write(salt);
    output.write(iv);
    input.pipe(cipher).pipe(output);
    output.on("finish", () => {
      console.log("[ENCRYPTION] File encrypted successfully");
      func();
    });
    output.on("error", (err) => {
      console.error("[ENCRYPTION] Encrypt output error:", err);
      func(err);
    });
    cipher.on("error", (err) => {
      console.error("[ENCRYPTION] Cipher error:", err);
      func(err);
    });
  } catch (ex) {
    console.error("[ENCRYPTION] Encrypt file error:", ex);
    func(ex);
  }
};
const decryptFile = (path2, outputPath, key, func) => {
  try {
    console.log("[ENCRYPTION] Starting file decryption...");
    console.log("[ENCRYPTION] Input path:", path2);
    console.log("[ENCRYPTION] Output path:", outputPath);
    const stats = fs.statSync(path2);
    console.log("[ENCRYPTION] File size:", stats.size);
    const fileContent = fs.readFileSync(path2);
    console.log("[ENCRYPTION] File read, size:", fileContent.length);
    console.log("[ENCRYPTION] Trying legacy format first...");
    tryLegacyFormat(path2, outputPath, key, (err) => {
      if (err) {
        console.log("[ENCRYPTION] Legacy format failed, trying new format...");
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        tryNewFormatFromBuffer(fileContent, outputPath, key, func);
      } else {
        func();
      }
    });
  } catch (ex) {
    console.error("[ENCRYPTION] Decrypt file error:", ex);
    func(ex);
  }
};
const tryNewFormatFromBuffer = (fileBuffer, outputPath, key, func) => {
  try {
    console.log("[ENCRYPTION] Trying new format from buffer...");
    if (fileBuffer.length < SALT_LENGTH + IV_LENGTH) {
      console.error("[ENCRYPTION] File too small for new format");
      func(new Error("File too small or corrupted"));
      return;
    }
    const salt = fileBuffer.slice(0, SALT_LENGTH);
    const iv = fileBuffer.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const encrypted = fileBuffer.slice(SALT_LENGTH + IV_LENGTH);
    console.log("[ENCRYPTION] Extracted salt and IV from buffer");
    const derivedKey = deriveKey(key, salt);
    const decipher = crypto.createDecipheriv(algorithm, derivedKey, iv);
    try {
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      console.log("[ENCRYPTION] Decrypted successfully (new format)");
      fs.writeFileSync(outputPath, decrypted);
      func();
    } catch (err) {
      console.error("[ENCRYPTION] New format decipher error:", err);
      func(err);
    }
  } catch (ex) {
    console.error("[ENCRYPTION] New format exception:", ex);
    func(ex);
  }
};
const tryLegacyFormat = (path2, outputPath, key, func) => {
  try {
    console.log("[ENCRYPTION] Attempting legacy format decryption...");
    const evpBytesToKey = (password, keyLen, ivLen) => {
      const buffers = [];
      let prev;
      let total = 0;
      while (total < keyLen + ivLen) {
        const hash = crypto.createHash("md5");
        if (prev) {
          hash.update(prev);
        }
        hash.update(password);
        prev = hash.digest();
        buffers.push(prev);
        total += prev.length;
      }
      const result = Buffer.concat(buffers);
      return {
        key: result.slice(0, keyLen),
        iv: result.slice(keyLen, keyLen + ivLen)
      };
    };
    const { key: derivedKey, iv } = evpBytesToKey(key, 32, 16);
    console.log("[ENCRYPTION] Legacy key and IV derived using EVP_BytesToKey");
    console.log("[ENCRYPTION] Key length:", derivedKey.length);
    console.log("[ENCRYPTION] IV length:", iv.length);
    const decipher = crypto.createDecipheriv("aes-256-cbc", derivedKey, iv);
    const input = fs.createReadStream(path2);
    const output = fs.createWriteStream(outputPath);
    input.pipe(decipher).pipe(output);
    output.on("finish", () => {
      console.log("[ENCRYPTION] File decrypted successfully (legacy format)");
      func();
    });
    output.on("error", (err) => {
      console.error("[ENCRYPTION] Legacy format output error:", err);
      func(err);
    });
    decipher.on("error", (err) => {
      console.error("[ENCRYPTION] Legacy format decipher error:", err);
      func(err);
    });
    input.on("error", (err) => {
      console.error("[ENCRYPTION] Legacy format input error:", err);
      func(err);
    });
  } catch (ex) {
    console.error("[ENCRYPTION] Legacy format exception:", ex);
    func(ex);
  }
};
const compress = (directory, func) => {
  const filename = os.tmpdir() + "/_jb_" + (/* @__PURE__ */ new Date()).valueOf() + ".tar.gz";
  tar.compress(
    {
      src: directory,
      dest: filename
    },
    (err) => {
      if (err) func(err);
      else func(null, filename);
    }
  );
};
const decompress = (filename, func) => {
  tar.decompress(
    {
      src: filename,
      dest: os.tmpdir() + "/_jbfiles",
      tar: {
        fmode: parseInt("777", 8),
        dmode: parseInt("777", 8)
      }
    },
    func
  );
};
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = path.dirname(__filename$1);
let mainWindow = null;
function createWindow() {
  console.log("[MAIN] Creating window...");
  console.log("[MAIN] __dirname:", __dirname$1);
  console.log("[MAIN] Preload path:", path.join(__dirname$1, "../preload/index.mjs"));
  mainWindow = new BrowserWindow({
    width: 1e3,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname$1, "../preload/index.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });
  console.log("[MAIN] Window created");
  if (!app.isPackaged) {
    console.log("[MAIN] Loading dev server...");
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    console.log("[MAIN] Loading production build...");
    mainWindow.loadFile(path.join(__dirname$1, "../renderer/index.html"));
  }
  mainWindow.setTitle("JournalBear");
  mainWindow.setMenu(null);
  mainWindow.webContents.on("did-finish-load", () => {
    console.log("[MAIN] Page loaded");
  });
  mainWindow.webContents.on("console-message", (_event, level, message) => {
    console.log(`[RENDERER] ${message}`);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
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
ipcMain.handle("open-file-dialog", async () => {
  console.log("[MAIN] Opening file dialog...");
  const result = await dialog.showOpenDialog({
    filters: [
      { name: "JournalBear 5.1 Document", extensions: ["zjournal"] },
      { name: "JournalBear 5.0 Document", extensions: ["ejournal"] }
    ]
  });
  if (result.canceled || !result.filePaths) {
    return null;
  }
  const filePath = result.filePaths[0];
  const fileVersion = filePath.endsWith(".ejournal") ? 5 : 5.1;
  const encryptedData = fs.readFileSync(filePath).toString();
  return {
    filePath,
    fileVersion,
    encryptedData
  };
});
ipcMain.handle("save-file-dialog", async () => {
  const result = await dialog.showSaveDialog({
    filters: [{ name: "JournalBear Document", extensions: ["zjournal"] }]
  });
  if (result.canceled || !result.filePath) {
    return null;
  }
  return result.filePath;
});
ipcMain.handle("decrypt-journal", async (_event, args) => {
  const { filePath, password, fileVersion } = args;
  const tmp = os.tmpdir();
  try {
    if (fileVersion === 5.1) {
      return new Promise((resolve, reject) => {
        decryptFile(filePath, tmp + "/_jb.tar.gz", password, (err) => {
          if (err) {
            reject(new Error("Wrong password or corrupted file"));
            return;
          }
          decompress(tmp + "/_jb.tar.gz", (decompressErr) => {
            if (decompressErr) {
              console.error("[DECRYPT] Decompress error:", decompressErr);
              reject(new Error("Failed to decompress journal"));
              return;
            }
            try {
              console.log("[DECRYPT] Looking for journal.json in:", tmp + "/_jbfiles");
              if (fs.existsSync(tmp + "/_jbfiles")) {
                const files = fs.readdirSync(tmp + "/_jbfiles");
                console.log("[DECRYPT] Files in _jbfiles:", files);
              } else {
                console.log("[DECRYPT] _jbfiles directory does not exist!");
              }
              let journalPath = tmp + "/_jbfiles/data.json";
              if (!fs.existsSync(journalPath)) {
                journalPath = tmp + "/_jbfiles/journal.json";
              }
              console.log("[DECRYPT] Reading journal from:", journalPath);
              const data = JSON.parse(fs.readFileSync(journalPath, "utf8"));
              const imagesDir = tmp + "/_jbfiles/images";
              if (fs.existsSync(imagesDir)) {
                data.en.forEach((entry, idx) => {
                  if (entry.attachment && entry.attachment.length > 0) {
                    entry.attachment = entry.attachment.map((_, imgIdx) => {
                      const filename = `${idx}_${imgIdx}.png`;
                      const imgPath = imagesDir + "/" + filename;
                      if (fs.existsSync(imgPath)) {
                        const imgBuffer = fs.readFileSync(imgPath);
                        return "data:image/png;base64," + imgBuffer.toString("base64");
                      }
                      return null;
                    }).filter(Boolean);
                  }
                });
              }
              resolve({ success: true, data });
            } catch (readErr) {
              console.error("[DECRYPT] Error reading journal:", readErr);
              reject(new Error("Failed to read journal data"));
            }
          });
        });
      });
    } else {
      const encryptedData = fs.readFileSync(filePath, "utf8");
      const decrypted = getDecryptedText(encryptedData, password);
      if (!decrypted) {
        throw new Error("Wrong password");
      }
      const data = JSON.parse(decrypted);
      return { success: true, data };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});
ipcMain.handle("save-journal", async (_event, args) => {
  const { filePath, password, journalData } = args;
  const tmp = os.tmpdir();
  try {
    await rimraf(tmp + "/_jbimages");
    await rimraf(tmp + "/_jbfiles");
    await rimraf(tmp + "/_jb.tar.gz");
    fs.mkdirSync(tmp + "/_jbfiles", { recursive: true });
    fs.mkdirSync(tmp + "/_jbimages", { recursive: true });
    fs.writeFileSync(tmp + "/_jbfiles/data.json", JSON.stringify(journalData));
    fs.mkdirSync(tmp + "/_jbfiles/images", { recursive: true });
    journalData.en.forEach((entry, idx) => {
      if (entry.attachment && entry.attachment.length > 0) {
        entry.attachment.forEach((img, imgIdx) => {
          const filename = `${idx}_${imgIdx}.png`;
          const buffer = Buffer.from(img.replace(/^data:image\/\w+;base64,/, ""), "base64");
          fs.writeFileSync(tmp + "/_jbfiles/images/" + filename, buffer);
        });
      }
    });
    return new Promise((resolve, reject) => {
      compress(tmp + "/_jbfiles", (err, archivePath) => {
        if (err || !archivePath) {
          reject(new Error("Failed to compress journal"));
          return;
        }
        encryptFile(archivePath, filePath, password, (encryptErr) => {
          if (encryptErr) {
            reject(new Error("Failed to encrypt journal"));
            return;
          }
          resolve({ success: true });
        });
      });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});
ipcMain.handle("export-html", async (_event, args) => {
  const result = await dialog.showSaveDialog({
    filters: [{ name: "HTML", extensions: ["html"] }]
  });
  if (result.canceled || !result.filePath) {
    return { success: false };
  }
  try {
    fs.writeFileSync(result.filePath, args.html);
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
ipcMain.handle("save-image-dialog", async () => {
  const result = await dialog.showOpenDialog({
    title: "Choose a folder",
    properties: ["openDirectory"]
  });
  if (result.canceled || !result.filePaths) {
    return null;
  }
  return result.filePaths[0];
});
ipcMain.handle("check-password-strength", async (_event, password) => {
  return checkPasswordStrength(password);
});
app.whenReady().then(() => {
  console.log("[MAIN] App ready");
  createWindow();
  const tmp = os.tmpdir();
  console.log("[MAIN] Cleaning up temp directory:", tmp);
  try {
    rimraf.sync(tmp + "/_jbimages");
    rimraf.sync(tmp + "/_jbfiles");
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
