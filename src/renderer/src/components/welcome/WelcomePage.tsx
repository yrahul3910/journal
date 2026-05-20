import { Card } from '@/components/ui/card'
import { useJournalStore } from '@/store/journal-store'
import { BookOpen, FolderOpen, Plus, type LucideIcon } from 'lucide-react'
import { useElectron } from '@/hooks/useElectron'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

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
    <div className="flex h-full flex-col items-center justify-center bg-background p-8">
      <div className="w-full max-w-3xl">
        {/* Brand */}
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BookOpen className="h-7 w-7" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">JournalBear</h1>
          <p className="mt-2 text-muted-foreground">Your private, encrypted journal</p>
        </div>

        {/* Primary actions */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ActionCard
            icon={Plus}
            title="New Journal"
            description="Start a new encrypted journal"
            onClick={handleNewJournal}
          />
          <ActionCard
            icon={FolderOpen}
            title="Open Journal"
            description="Open an existing journal file"
            onClick={handleOpen}
          />
          <ActionCard
            icon={BookOpen}
            title="Getting Started"
            description="Learn the basics with a quick tutorial"
            onClick={handleTutorial}
          />
        </div>
      </div>

      {/* Quiet footer links */}
      <div className="mt-12 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
        <button onClick={handleTutorial} className="transition-colors hover:text-foreground">
          Tutorial
        </button>
        <FooterLink href="https://journalbear.wordpress.com/2017/12/02/markdown-formatting/">
          Markdown help
        </FooterLink>
        <FooterLink href="https://github.com/yrahul3910/journal">Source</FooterLink>
        <FooterLink href="https://github.com/yrahul3910/journal/issues">Report a bug</FooterLink>
      </div>
    </div>
  )
}

interface ActionCardProps {
  icon: LucideIcon
  title: string
  description: string
  onClick: () => void
}

function ActionCard({ icon: Icon, title, description, onClick }: ActionCardProps) {
  return (
    <Card
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={cn(
        'group flex cursor-pointer flex-col gap-3 p-5 outline-none transition-all',
        'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md',
        'focus-visible:ring-2 focus-visible:ring-ring/60'
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </Card>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="transition-colors hover:text-foreground"
    >
      {children}
    </a>
  )
}
