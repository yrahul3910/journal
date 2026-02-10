import { useState } from 'react'
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

export function NewJournalDialog() {
  const { activeDialog, closeDialog } = useJournalStore()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const isOpen = activeDialog === 'newJournal'

  const handleSubmit = async () => {
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length === 0) {
      setError('Password cannot be empty')
      return
    }

    setIsLoading(true)

    // Check password strength
    const errors = await window.electron.checkPasswordStrength(password)
    if (errors.length > 0) {
      setError(errors[0])
      setIsLoading(false)
      return
    }

    // Create new journal
    useJournalStore.setState({
      journalData: { en: [] },
      password,
      viewMode: 'journal'
    })

    setIsLoading(false)
    closeDialog()
    resetForm()
  }

  const resetForm = () => {
    setPassword('')
    setConfirmPassword('')
    setError('')
  }

  const handleClose = () => {
    closeDialog()
    resetForm()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Journal</DialogTitle>
          <DialogDescription>
            Please enter a secure password to encrypt your journal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter a strong password"
            />
          </div>

          <div>
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Creating...' : 'Create New Journal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
