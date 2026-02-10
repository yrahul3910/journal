import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useJournalStore } from '@/store/journal-store'
import { AlertCircle } from 'lucide-react'

interface ErrorDialogProps {
  message?: string
}

export function ErrorDialog({ message = 'An error occurred' }: ErrorDialogProps) {
  const { activeDialog, closeDialog } = useJournalStore()
  const isOpen = activeDialog === 'error'

  return (
    <Dialog open={isOpen} onOpenChange={closeDialog}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <DialogTitle>Error</DialogTitle>
          </div>
          <DialogDescription>Something went wrong.</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm">{message}</p>
        </div>

        <DialogFooter>
          <Button onClick={closeDialog}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
