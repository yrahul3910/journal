import { Minus, Square, X } from 'lucide-react'
import { useJournalStore } from '@/store/journal-store'

export function Titlebar() {
  const handleMinimize = () => {
    window.electron.minimizeWindow()
  }

  const handleMaximize = () => {
    window.electron.maximizeWindow()
  }

  const handleClose = () => {
    window.electron.closeWindow()
  }

  return (
    <div className="titlebar-drag flex h-8 items-center justify-between bg-primary px-4 text-primary-foreground">
      <div className="titlebar-no-drag text-sm">
        {/* Save status will be shown here */}
      </div>
      <div className="titlebar-no-drag flex gap-2">
        <button
          onClick={handleMinimize}
          className="flex h-6 w-6 items-center justify-center hover:bg-primary-foreground/20 rounded"
          aria-label="Minimize"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={handleMaximize}
          className="flex h-6 w-6 items-center justify-center hover:bg-primary-foreground/20 rounded"
          aria-label="Maximize"
        >
          <Square className="h-3 w-3" />
        </button>
        <button
          onClick={handleClose}
          className="flex h-6 w-6 items-center justify-center hover:bg-destructive rounded"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
