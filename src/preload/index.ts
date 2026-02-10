import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // Window controls
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),

  // File operations
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  saveFileDialog: () => ipcRenderer.invoke('save-file-dialog'),
  decryptJournal: (args: { filePath: string; password: string; fileVersion: number }) =>
    ipcRenderer.invoke('decrypt-journal', args),
  saveJournal: (args: { filePath: string; password: string; journalData: any }) =>
    ipcRenderer.invoke('save-journal', args),
  exportHtml: (args: { html: string }) => ipcRenderer.invoke('export-html', args),
  saveImageDialog: () => ipcRenderer.invoke('save-image-dialog'),
  checkPasswordStrength: (password: string) => ipcRenderer.invoke('check-password-strength', password)
})
