import { JournalEntry, SENTIMENT_COLORS } from '@/types/journal'
import { format } from 'date-fns'
import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EntryCardProps {
  entry: JournalEntry
  isSelected: boolean
  onClick: () => void
}

export function EntryCard({ entry, isSelected, onClick }: EntryCardProps) {
  const date = new Date(entry.entryDate)
  const sentimentColor = SENTIMENT_COLORS[entry.sentiment]
  const hasAttachments = entry.attachment && entry.attachment.length > 0

  // Get preview text (first 100 characters)
  const previewText = entry.content.substring(0, 100) + (entry.content.length > 100 ? '...' : '')

  return (
    <div
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-lg border p-3 transition-colors hover:bg-accent',
        isSelected && 'bg-accent border-primary'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Sentiment indicator */}
        <div
          className="mt-1 h-3 w-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: sentimentColor }}
          title={entry.sentiment}
        />

        <div className="flex-1 min-w-0">
          {/* Date */}
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold">{format(date, 'MMM dd, yyyy')}</p>
            {entry.nsfw && (
              <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded">NSFW</span>
            )}
            {hasAttachments && (
              <ImageIcon className="h-3 w-3 text-muted-foreground" title="Has attachments" />
            )}
          </div>

          {/* Preview */}
          <p className="text-xs text-muted-foreground line-clamp-2">{previewText}</p>
        </div>
      </div>
    </div>
  )
}
