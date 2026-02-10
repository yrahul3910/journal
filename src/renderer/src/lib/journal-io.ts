import { useJournalStore } from '@/store/journal-store'
import showdown from 'showdown'

// Showdown converter for HTML export
const converter = new showdown.Converter({
  literalMidWordUnderscores: true,
  literalMidWordAsterisks: true,
  tables: true,
  strikethrough: true,
  tasklists: true,
  simpleLineBreaks: true,
  simplifiedAutoLink: true,
  openLinksInNewWindow: true,
  emoji: false,
  backslashEscapesHTMLTags: true
})

export async function saveJournal(): Promise<{ success: boolean; error?: string }> {
  const state = useJournalStore.getState()
  const { journalData, password, currentFilePath } = state

  if (!journalData || !password) {
    return { success: false, error: 'No journal is open' }
  }

  try {
    let filePath = currentFilePath

    // If no current file path, ask for save location
    if (!filePath) {
      const result = await window.electron.saveFileDialog()
      if (!result) {
        return { success: false, error: 'Save cancelled' }
      }
      filePath = result
      useJournalStore.setState({ currentFilePath: filePath })
    }

    // Save journal using IPC
    const result = await window.electron.saveJournal({
      filePath,
      password,
      journalData
    })

    return result
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

export async function exportToHTML(): Promise<{ success: boolean; error?: string }> {
  const state = useJournalStore.getState()
  const { journalData } = state

  if (!journalData) {
    return { success: false, error: 'No journal is open' }
  }

  try {
    // Generate HTML
    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Journal Export</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
    }
    .entry {
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e0e0e0;
    }
    .entry-date {
      font-size: 1.5em;
      font-weight: bold;
      color: #333;
      margin-bottom: 10px;
    }
    .entry-sentiment {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 0.9em;
      margin-bottom: 10px;
    }
    .sentiment-Happy { background-color: #4caf50; color: white; }
    .sentiment-Sad { background-color: #fbc02d; color: white; }
    .sentiment-Angry { background-color: #f44336; color: white; }
    .sentiment-Loved { background-color: #ff69b4; color: white; }
    .sentiment-Excited { background-color: #00ff00; color: white; }
    .sentiment-Neutral { background-color: #9e9e9e; color: white; }
    .entry-content {
      margin-top: 15px;
    }
    .entry-images {
      margin-top: 15px;
    }
    .entry-images img {
      max-width: 100%;
      margin: 10px 0;
      border-radius: 8px;
    }
    .nsfw-badge {
      background-color: #f44336;
      color: white;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.8em;
      margin-left: 10px;
    }
  </style>
</head>
<body>
  <h1>My Journal</h1>
`

    // Add entries (sorted by date)
    const sortedEntries = [...journalData.en].sort(
      (a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime()
    )

    sortedEntries.forEach((entry) => {
      const date = new Date(entry.entryDate)
      const dateStr = date.toDateString()
      const contentHtml = converter.makeHtml(entry.content)

      html += `
  <div class="entry">
    <div class="entry-date">${dateStr}</div>
    <span class="entry-sentiment sentiment-${entry.sentiment}">${entry.sentiment}</span>
    ${entry.nsfw ? '<span class="nsfw-badge">NSFW</span>' : ''}
    <div class="entry-content">${contentHtml}</div>
`

      if (entry.attachment && entry.attachment.length > 0) {
        html += '    <div class="entry-images">\n'
        entry.attachment.forEach((img) => {
          html += `      <img src="${img}" alt="Attachment" />\n`
        })
        html += '    </div>\n'
      }

      html += '  </div>\n'
    })

    html += `
</body>
</html>`

    // Export using IPC
    const result = await window.electron.exportHtml({ html })
    return result
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}
