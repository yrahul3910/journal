import { contextBridge, ipcRenderer } from "electron";
console.log("[PRELOAD] Preload script starting...");
try {
  contextBridge.exposeInMainWorld("electron", {
    // Window controls
    minimizeWindow: () => ipcRenderer.send("minimize-window"),
    maximizeWindow: () => ipcRenderer.send("maximize-window"),
    closeWindow: () => ipcRenderer.send("close-window"),
    // File operations
    openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),
    saveFileDialog: () => ipcRenderer.invoke("save-file-dialog"),
    decryptJournal: (args) => ipcRenderer.invoke("decrypt-journal", args),
    saveJournal: (args) => ipcRenderer.invoke("save-journal", args),
    exportHtml: (args) => ipcRenderer.invoke("export-html", args),
    saveImageDialog: () => ipcRenderer.invoke("save-image-dialog"),
    checkPasswordStrength: (password) => ipcRenderer.invoke("check-password-strength", password)
  });
  console.log("[PRELOAD] Successfully exposed electron API");
} catch (error) {
  console.error("[PRELOAD] Error exposing API:", error);
}
