import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useJournalStore } from '@/store/journal-store'
import { saveJournal, exportToHTML } from '@/lib/journal-io'
import { toast } from 'sonner'
import { Minus, Square, X } from 'lucide-react'

export function MenuBar() {
  const { journalData, openDialog } = useJournalStore()

  const handleMinimize = () => {
    window.electron.minimizeWindow()
  }

  const handleMaximize = () => {
    window.electron.maximizeWindow()
  }

  const handleClose = () => {
    window.electron.closeWindow()
  }

  const handleNewJournal = () => {
    openDialog('newJournal')
  }

  const handleOpen = async () => {
    const result = await window.electron.openFileDialog()
    if (result) {
      useJournalStore.setState({
        currentFilePath: result.filePath,
        currentFileVersion: result.fileVersion,
        encryptedData: result.encryptedData,
        viewMode: 'journal'
      })
      openDialog('decrypt')
    }
  }

  const handleSave = async () => {
    if (!journalData) {
      toast.error('No journal is open.')
      return
    }

    toast.loading('Saving journal...')
    const result = await saveJournal()

    if (result.success) {
      toast.success('Journal saved successfully!')
    } else {
      toast.error(result.error || 'Failed to save journal')
    }
  }

  const handleExport = async () => {
    if (!journalData) {
      toast.error('No journal is open.')
      return
    }

    toast.loading('Exporting to HTML...')
    const result = await exportToHTML()

    if (result.success) {
      toast.success('Exported successfully!')
    } else {
      toast.error(result.error || 'Failed to export journal')
    }
  }

  const handleNewEntry = () => {
    if (!journalData) {
      toast.error('No journal is open.')
      return
    }
    useJournalStore.setState({
      isNewEntry: true,
      editingEntry: null,
      encodedImages: []
    })
    openDialog('edit')
  }

  const handleUpdateEntry = () => {
    if (!journalData) {
      toast.error('No journal is open.')
      return
    }
    const { selectedEntry, selectedEntryIndex } = useJournalStore.getState()
    if (!selectedEntry || selectedEntryIndex === null) {
      toast.error('Please select an entry to update.')
      return
    }
    useJournalStore.setState({
      isNewEntry: false,
      editingEntry: selectedEntry,
      encodedImages: selectedEntry.attachment || []
    })
    openDialog('edit')
  }

  const handleSearch = () => {
    if (!journalData) {
      toast.error('No journal is open.')
      return
    }
    openDialog('search')
  }

  const handleStatistics = () => {
    if (!journalData) {
      toast.error('No journal is open.')
      return
    }
    openDialog('statistics')
  }

  const handleSettings = () => {
    openDialog('settings')
  }

  const handleChangePassword = () => {
    if (!journalData) {
      toast.error('No journal is open.')
      return
    }
    // TODO: Implement password change dialog
    toast.info('Password change feature coming soon!')
  }

  const handleAbout = () => {
    openDialog('about')
  }

  const handleIntro = () => {
    openDialog('intro')
  }

  return (
    <div className="titlebar-drag flex h-10 items-center justify-between bg-black text-white px-4">
      {/* Left side: App name + menus */}
      <div className="titlebar-no-drag flex items-center gap-4">
        <div className="text-sm font-bold">JournalBear</div>
        <div className="flex gap-1">
          {/* File Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="px-3 py-1.5 text-xs hover:bg-white/10 rounded text-white">
              File
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleNewJournal}>New Journal</DropdownMenuItem>
              <DropdownMenuItem onClick={handleOpen}>Open</DropdownMenuItem>
              <DropdownMenuItem onClick={handleSave}>Save</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExport}>Export to HTML</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Entry Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="px-3 py-1.5 text-xs hover:bg-white/10 rounded text-white">
              Entry
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleNewEntry}>New Entry</DropdownMenuItem>
              <DropdownMenuItem onClick={handleUpdateEntry}>Update Entry</DropdownMenuItem>
              <DropdownMenuItem onClick={handleSearch}>Search</DropdownMenuItem>
              <DropdownMenuItem onClick={handleStatistics}>Your Statistics</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Preferences Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="px-3 py-1.5 text-xs hover:bg-white/10 rounded text-white">
              Preferences
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleSettings}>Settings</DropdownMenuItem>
              <DropdownMenuItem onClick={handleChangePassword}>Change Password</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Help Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="px-3 py-1.5 text-xs hover:bg-white/10 rounded text-white">
              Help
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleAbout}>About</DropdownMenuItem>
              <DropdownMenuItem onClick={handleIntro}>Getting Started</DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href="https://journalbear.wordpress.com/2017/12/02/markdown-formatting/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Markdown formatting help
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href="https://journalbear.wordpress.com/contact/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Contact Us
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Right side: Window controls */}
      <div className="titlebar-no-drag flex gap-2">
        <button
          onClick={handleMinimize}
          className="flex h-6 w-6 items-center justify-center hover:bg-white/10 rounded"
          aria-label="Minimize"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={handleMaximize}
          className="flex h-6 w-6 items-center justify-center hover:bg-white/10 rounded"
          aria-label="Maximize"
        >
          <Square className="h-3 w-3" />
        </button>
        <button
          onClick={handleClose}
          className="flex h-6 w-6 items-center justify-center hover:bg-red-600 rounded"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
