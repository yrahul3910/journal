import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useJournalStore } from '@/store/journal-store'
import { VERSION_NUMBER } from '@/types/journal'

export function AboutDialog() {
  const { activeDialog, closeDialog } = useJournalStore()
  const isOpen = activeDialog === 'about'

  return (
    <Dialog open={isOpen} onOpenChange={closeDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>About JournalBear</DialogTitle>
          <DialogDescription>Version {VERSION_NUMBER}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm">
            JournalBear is an encrypted journaling application that helps you keep your thoughts
            private and secure.
          </p>

          <div>
            <h3 className="font-semibold mb-2">Features</h3>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>AES-256 encryption for maximum security</li>
              <li>Markdown formatting support</li>
              <li>Image attachments</li>
              <li>Sentiment tracking</li>
              <li>Statistics and insights</li>
              <li>Dark mode support</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Credits</h3>
            <p className="text-sm">
              Developed by Rahul Yedida
              <br />
              <a
                href="https://github.com/yrahul3910/journal"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                View on GitHub
              </a>
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            © 2024 JournalBear. All rights reserved.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
