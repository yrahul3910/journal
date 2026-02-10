import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useJournalStore } from '@/store/journal-store'
import { BookOpen, FolderOpen, Plus } from 'lucide-react'
import { useElectron } from '@/hooks/useElectron'
import { toast } from 'sonner'

export function WelcomePage() {
  const { openDialog } = useJournalStore()
  const { electron, isReady } = useElectron()

  const handleNewJournal = () => {
    openDialog('newJournal')
  }

  const handleOpen = async () => {
    if (!electron || !isReady) {
      toast.error('Electron API not ready')
      return
    }
    const result = await electron.openFileDialog()
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

  const handleTutorial = () => {
    openDialog('intro')
  }

  return (
    <div className="flex h-full items-center justify-center bg-background p-8">
      <div className="w-full max-w-6xl">
        <div className="mb-8 text-center">
          <h1 className="text-5xl font-bold mb-4">JournalBear</h1>
          <p className="text-xl text-muted-foreground">
            Your private, encrypted journal
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={handleNewJournal}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                <CardTitle>New Journal</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Create a new encrypted journal with a secure password
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={handleOpen}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                <CardTitle>Open Journal</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Open an existing journal file (.zjournal or .ejournal)
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={handleTutorial}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                <CardTitle>Getting Started</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Learn how to use JournalBear with our tutorial
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Get Started</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    handleTutorial()
                  }}
                  className="block text-primary hover:underline"
                >
                  Follow our Getting Started tutorial
                </a>
                <a
                  href="https://github.com/yrahul3910/journal/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-primary hover:underline"
                >
                  Request a feature or report a bug
                </a>
                <a
                  href="https://github.com/yrahul3910/journal"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-primary hover:underline"
                >
                  View our source code
                </a>
                <a
                  href="https://journalbear.wordpress.com/contact/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-primary hover:underline"
                >
                  Leave us a message
                </a>
              </div>

              <div className="mt-6">
                <h3 className="font-semibold mb-3">Help</h3>
                <div className="space-y-3">
                  <a
                    href="https://journalbear.wordpress.com/2017/12/02/markdown-formatting/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-primary hover:underline"
                  >
                    Markdown Formatting Help
                  </a>
                  <a
                    href="https://www.wikiwand.com/en/Advanced_Encryption_Standard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-primary hover:underline"
                  >
                    Learn more about the encryption algorithm we use
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What's New in v6.0</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 list-disc list-inside">
                <li>Complete React + TypeScript rewrite</li>
                <li>Modern UI with shadcn/ui components</li>
                <li>Improved dark mode support</li>
                <li>Entries grouped by year</li>
                <li>UI theme syncs with system preferences</li>
                <li>Enhanced emoji picker</li>
                <li>Better file attachment handling</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
