import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import os from 'os'
import { rimraf } from 'rimraf'
import * as encryption from './encryption'
import * as archive from './archive'

// In ESM, __dirname is not available, so we need to create it
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null

function createWindow() {
  console.log('[MAIN] Creating window...')
  console.log('[MAIN] __dirname:', __dirname)
  console.log('[MAIN] Preload path:', path.join(__dirname, '../preload/index.mjs'))

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  console.log('[MAIN] Window created')

  // In development, load from vite dev server
  if (!app.isPackaged) {
    console.log('[MAIN] Loading dev server...')
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    console.log('[MAIN] Loading production build...')
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.setTitle('JournalBear')
  mainWindow.setMenu(null)

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[MAIN] Page loaded')
  })

  mainWindow.webContents.on('console-message', (_event, level, message) => {
    console.log(`[RENDERER] ${message}`)
  })

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
  console.log('[MAIN] Opening file dialog...')
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
              console.error('[DECRYPT] Decompress error:', decompressErr)
              reject(new Error('Failed to decompress journal'))
              return
            }

            // Step 3: Read JSON and load images
            try {
              console.log('[DECRYPT] Looking for journal.json in:', tmp + '/_jbfiles')

              // Check if the directory exists and list its contents
              if (fs.existsSync(tmp + '/_jbfiles')) {
                const files = fs.readdirSync(tmp + '/_jbfiles')
                console.log('[DECRYPT] Files in _jbfiles:', files)
              } else {
                console.log('[DECRYPT] _jbfiles directory does not exist!')
              }

              // Try both data.json (old format) and journal.json (new format)
              let journalPath = tmp + '/_jbfiles/data.json'
              if (!fs.existsSync(journalPath)) {
                journalPath = tmp + '/_jbfiles/journal.json'
              }

              console.log('[DECRYPT] Reading journal from:', journalPath)
              const data = JSON.parse(fs.readFileSync(journalPath, 'utf8'))

              // Load image attachments from images directory
              const imagesDir = tmp + '/_jbfiles/images'
              console.log('[DECRYPT] Checking for images directory:', imagesDir)
              console.log('[DECRYPT] Images directory exists:', fs.existsSync(imagesDir))

              if (fs.existsSync(imagesDir)) {
                const imageFiles = fs.readdirSync(imagesDir)
                console.log('[DECRYPT] Found image files:', imageFiles)

                data.en.forEach((entry: any, idx: number) => {
                  if (entry.attachment) {
                    console.log(
                      `[DECRYPT] Entry ${idx} has attachment:`,
                      entry.attachment,
                      typeof entry.attachment
                    )

                    if (Array.isArray(entry.attachment) && entry.attachment.length > 0) {
                      const images: string[] = []

                      // Check if attachment contains paths or is already base64
                      const firstItem = entry.attachment[0]
                      if (typeof firstItem === 'string' && firstItem.includes('/_jbfiles/')) {
                        // It's a path - load the actual files
                        entry.attachment.forEach((filePath: string) => {
                          // Convert relative path to absolute
                          const filename = filePath.split('/').pop() // Get just the filename
                          const fullPath = tmp + '/_jbfiles/images/' + filename
                          console.log(`[DECRYPT] Loading image from path: ${fullPath}`)

                          if (fs.existsSync(fullPath)) {
                            const imgBuffer = fs.readFileSync(fullPath)
                            // Detect image type from extension
                            const ext = filename?.split('.').pop()?.toLowerCase()
                            const mimeType =
                              ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
                            const base64 = `data:${mimeType};base64,` + imgBuffer.toString('base64')
                            console.log(
                              `[DECRYPT] Loaded image ${filename}, size: ${imgBuffer.length} bytes`
                            )
                            images.push(base64)
                          } else {
                            console.log(`[DECRYPT] Image not found: ${fullPath}`)
                          }
                        })
                      } else if (
                        typeof entry.attachment === 'number' ||
                        (Array.isArray(entry.attachment) && typeof entry.attachment[0] === 'number')
                      ) {
                        // It's a count - try the old naming pattern
                        const count =
                          typeof entry.attachment === 'number'
                            ? entry.attachment
                            : entry.attachment.length
                        for (let imgIdx = 0; imgIdx < count; imgIdx++) {
                          const filename = `${idx}_${imgIdx}.png`
                          const imgPath = imagesDir + '/' + filename
                          if (fs.existsSync(imgPath)) {
                            const imgBuffer = fs.readFileSync(imgPath)
                            const base64 = 'data:image/png;base64,' + imgBuffer.toString('base64')
                            images.push(base64)
                          }
                        }
                      }

                      console.log(`[DECRYPT] Entry ${idx} loaded ${images.length} images`)
                      entry.attachment = images
                    }
                  }
                })
              } else {
                console.log('[DECRYPT] No images directory found')
              }

              resolve({ success: true, data })
            } catch (readErr) {
              console.error('[DECRYPT] Error reading journal:', readErr)
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

    // Write journal JSON (use data.json to match old format)
    fs.writeFileSync(tmp + '/_jbfiles/data.json', JSON.stringify(journalData))

    // Create images directory inside _jbfiles
    fs.mkdirSync(tmp + '/_jbfiles/images', { recursive: true })

    // Write image attachments
    journalData.en.forEach((entry: any, idx: number) => {
      if (entry.attachment && entry.attachment.length > 0) {
        entry.attachment.forEach((img: string, imgIdx: number) => {
          const filename = `${idx}_${imgIdx}.png`
          const buffer = Buffer.from(img.replace(/^data:image\/\w+;base64,/, ''), 'base64')
          fs.writeFileSync(tmp + '/_jbfiles/images/' + filename, buffer)
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
  return encryption.checkPasswordStrength(password)
})

// App lifecycle
app.whenReady().then(() => {
  console.log('[MAIN] App ready')
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
