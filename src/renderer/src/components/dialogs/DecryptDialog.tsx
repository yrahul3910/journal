import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useJournalStore } from '@/store/journal-store'

export function DecryptDialog() {
  const { activeDialog, closeDialog, currentFilePath, currentFileVersion, encryptedData } =
    useJournalStore()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const isOpen = activeDialog === 'decrypt'

  // Auto-focus password input when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        document.getElementById('unlock-password')?.focus()
      }, 100)
    }
  }, [isOpen])

  const handleSubmit = async () => {
    if (!currentFilePath || !currentFileVersion) {
      setError('No file selected')
      return
    }

    setError('')
    setIsLoading(true)

    try {
      const result = await window.electron.decryptJournal({
        filePath: currentFilePath,
        password,
        fileVersion: currentFileVersion
      })

      if (result.success && result.data) {
        useJournalStore.setState({
          journalData: result.data,
          password,
          viewMode: 'journal'
        })
        closeDialog()
        resetForm()
      } else {
        setError(result.error || 'Wrong password or corrupted file')
      }
    } catch (err) {
      setError('Failed to decrypt journal')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setPassword('')
    setError('')
  }

  const handleClose = () => {
    closeDialog()
    resetForm()
    // Reset view mode to welcome if closing without decrypting
    useJournalStore.setState({ viewMode: 'welcome' })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enter Password</DialogTitle>
          <DialogDescription>
            Enter the password to decrypt your journal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="unlock-password">Password</Label>
            <Input
              id="unlock-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your password"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Decrypting...' : 'Decrypt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
