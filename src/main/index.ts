import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { rimraf } from 'rimraf'
import * as encryption from './encryption'
import * as archive from './archive'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // In development, load from vite dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.setTitle('JournalBear')
  mainWindow.setMenu(null)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// IPC Handlers

// Window controls
ipcMain.on('minimize-window', () => {
  mainWindow?.minimize()
})

ipcMain.on('maximize-window', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.on('close-window', () => {
  mainWindow?.close()
})

// File operations
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog({
    filters: [
      { name: 'JournalBear 5.1 Document', extensions: ['zjournal'] },
      { name: 'JournalBear 5.0 Document', extensions: ['ejournal'] }
    ]
  })

  if (result.canceled || !result.filePaths) {
    return null
  }

  const filePath = result.filePaths[0]
  const fileVersion = filePath.endsWith('.ejournal') ? 5.0 : 5.1
  const encryptedData = fs.readFileSync(filePath).toString()

  return {
    filePath,
    fileVersion,
    encryptedData
  }
})

ipcMain.handle('save-file-dialog', async () => {
  const result = await dialog.showSaveDialog({
    filters: [{ name: 'JournalBear Document', extensions: ['zjournal'] }]
  })

  if (result.canceled || !result.filePath) {
    return null
  }

  return result.filePath
})

ipcMain.handle('decrypt-journal', async (_event, args: { filePath: string; password: string; fileVersion: number }) => {
  const { filePath, password, fileVersion } = args
  const tmp = os.tmpdir()

  try {
    if (fileVersion === 5.1) {
      // New format: decrypt -> decompress -> read JSON
      return new Promise((resolve, reject) => {
        // Step 1: Decrypt file
        encryption.decryptFile(filePath, tmp + '/_jb.tar.gz', password, (err) => {
          if (err) {
            reject(new Error('Wrong password or corrupted file'))
            return
          }

          // Step 2: Decompress
          archive.decompress(tmp + '/_jb.tar.gz', (decompressErr) => {
            if (decompressErr) {
              reject(new Error('Failed to decompress journal'))
              return
            }

            // Step 3: Read JSON
            try {
              const journalPath = tmp + '/_jbfiles/journal.json'
              const data = JSON.parse(fs.readFileSync(journalPath, 'utf8'))
              resolve({ success: true, data })
            } catch (readErr) {
              reject(new Error('Failed to read journal data'))
            }
          })
        })
      })
    } else {
      // Legacy format (5.0): decrypt text directly
      const encryptedData = fs.readFileSync(filePath, 'utf8')
      const decrypted = encryption.getDecryptedText(encryptedData, password)

      if (!decrypted) {
        throw new Error('Wrong password')
      }

      const data = JSON.parse(decrypted)
      return { success: true, data }
    }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('save-journal', async (_event, args: { filePath: string; password: string; journalData: any }) => {
  const { filePath, password, journalData } = args
  const tmp = os.tmpdir()

  try {
    // Clean up temp directories
    await rimraf(tmp + '/_jbimages')
    await rimraf(tmp + '/_jbfiles')
    await rimraf(tmp + '/_jb.tar.gz')

    // Create temp directories
    fs.mkdirSync(tmp + '/_jbfiles', { recursive: true })
    fs.mkdirSync(tmp + '/_jbimages', { recursive: true })

    // Write journal JSON
    fs.writeFileSync(tmp + '/_jbfiles/journal.json', JSON.stringify(journalData))

    // Write image attachments
    journalData.en.forEach((entry: any, idx: number) => {
      if (entry.attachment && entry.attachment.length > 0) {
        entry.attachment.forEach((img: string, imgIdx: number) => {
          const filename = `${idx}_${imgIdx}.png`
          const buffer = Buffer.from(img.replace(/^data:image\/\w+;base64,/, ''), 'base64')
          fs.writeFileSync(tmp + '/_jbimages/' + filename, buffer)
        })
      }
    })

    // Compress
    return new Promise((resolve, reject) => {
      archive.compress(tmp + '/_jbfiles', (err, archivePath) => {
        if (err || !archivePath) {
          reject(new Error('Failed to compress journal'))
          return
        }

        // Encrypt
        encryption.encryptFile(archivePath, filePath, password, (encryptErr) => {
          if (encryptErr) {
            reject(new Error('Failed to encrypt journal'))
            return
          }

          resolve({ success: true })
        })
      })
    })
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('export-html', async (_event, args: { html: string }) => {
  const result = await dialog.showSaveDialog({
    filters: [{ name: 'HTML', extensions: ['html'] }]
  })

  if (result.canceled || !result.filePath) {
    return { success: false }
  }

  try {
    fs.writeFileSync(result.filePath, args.html)
    return { success: true, filePath: result.filePath }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('save-image-dialog', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose a folder',
    properties: ['openDirectory']
  })

  if (result.canceled || !result.filePaths) {
    return null
  }

  return result.filePaths[0]
})

ipcMain.handle('check-password-strength', async (_event, password: string) => {
  return encryption.checkPwdStrength(password)
})

// App lifecycle
app.whenReady().then(() => {
  createWindow()

  // Perform cleanup
  const tmp = os.tmpdir()
  console.log('[MAIN] Cleaning up temp directory:', tmp)
  try {
    rimraf.sync(tmp + '/_jbimages')
    rimraf.sync(tmp + '/_jbfiles')
    rimraf.sync(tmp + '/_jb.tar.gz')
    console.log('[MAIN] Cleanup complete')
  } catch (err) {
    console.error('[MAIN] Cleanup error:', err)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
