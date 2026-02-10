import { useJournalStore } from '@/store/journal-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { format } from 'date-fns'
import { SENTIMENT_COLORS } from '@/types/journal'

export function EntryViewer() {
  const { selectedEntry } = useJournalStore()

  if (!selectedEntry) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Select an entry to view</p>
      </div>
    )
  }

  const date = new Date(selectedEntry.entryDate)
  const sentimentColor = SENTIMENT_COLORS[selectedEntry.sentiment]

  return (
    <ScrollArea className="h-full">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="h-4 w-4 rounded-full"
              style={{ backgroundColor: sentimentColor }}
              title={selectedEntry.sentiment}
            />
            <h2 className="text-2xl font-bold">{format(date, 'MMMM dd, yyyy')}</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Feeling: {selectedEntry.sentiment}
            {selectedEntry.nsfw && (
              <span className="ml-2 text-xs bg-red-500 text-white px-2 py-0.5 rounded">NSFW</span>
            )}
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-slate dark:prose-invert max-w-none mb-6">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {processEmojiShortcodes(selectedEntry.content)}
          </ReactMarkdown>
        </div>

        {/* Attachments */}
        {selectedEntry.attachment &&
          Array.isArray(selectedEntry.attachment) &&
          selectedEntry.attachment.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Attachments</h3>
              <div className="grid grid-cols-2 gap-4">
                {selectedEntry.attachment.map((img, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={img}
                    alt={`Attachment ${idx + 1}`}
                    className="rounded-lg border shadow-sm w-full h-auto cursor-pointer hover:shadow-md transition-shadow"
                    onContextMenu={(e) => {
                      e.preventDefault()
                      handleImageContextMenu(img)
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  )
}

// Process emoji shortcodes (:smile: -> actual emoji or image)
function processEmojiShortcodes(text: string): string {
  // For now, just return the text as-is
  // TODO: Implement emoji shortcode replacement
  return text
}

// Handle right-click on image to save
function handleImageContextMenu(imageSrc: string) {
  // TODO: Implement save image dialog
  console.log('Save image:', imageSrc)
}
