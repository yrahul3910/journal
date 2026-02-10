import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useJournalStore } from '@/store/journal-store'

export function MenuBar() {
  const { journalData, openDialog } = useJournalStore()

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

  const handleSave = () => {
    if (!journalData) {
      alert('No journal is open.')
      return
    }
    // Will implement save logic
    console.log('Save clicked')
  }

  const handleExport = () => {
    if (!journalData) {
      alert('No journal is open.')
      return
    }
    // Will implement export logic
    console.log('Export clicked')
  }

  const handleNewEntry = () => {
    if (!journalData) {
      alert('No journal is open.')
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
      alert('No journal is open.')
      return
    }
    const { selectedEntry, selectedEntryIndex } = useJournalStore.getState()
    if (!selectedEntry || selectedEntryIndex === null) {
      alert('Please select an entry to update.')
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
      alert('No journal is open.')
      return
    }
    openDialog('search')
  }

  const handleStatistics = () => {
    if (!journalData) {
      alert('No journal is open.')
      return
    }
    openDialog('statistics')
  }

  const handleSettings = () => {
    openDialog('settings')
  }

  const handleChangePassword = () => {
    if (!journalData) {
      alert('No journal is open.')
      return
    }
    openDialog('newJournal') // Reuse new journal dialog for password change
  }

  const handleAbout = () => {
    openDialog('about')
  }

  const handleIntro = () => {
    openDialog('intro')
  }

  return (
    <div className="flex h-12 items-center gap-4 border-b bg-background px-4">
      <div className="text-lg font-bold">JournalBear</div>
      <div className="flex gap-1">
        {/* File Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="px-3 py-1.5 text-sm hover:bg-accent rounded">
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
          <DropdownMenuTrigger className="px-3 py-1.5 text-sm hover:bg-accent rounded">
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
          <DropdownMenuTrigger className="px-3 py-1.5 text-sm hover:bg-accent rounded">
            Preferences
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={handleSettings}>Settings</DropdownMenuItem>
            <DropdownMenuItem onClick={handleChangePassword}>Change Password</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Help Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="px-3 py-1.5 text-sm hover:bg-accent rounded">
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
  )
}
