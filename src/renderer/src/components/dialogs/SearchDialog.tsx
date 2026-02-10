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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useJournalStore } from '@/store/journal-store'
import type { Sentiment } from '@/types/journal'
import { ScrollArea } from '@/components/ui/scroll-area'
import { format } from 'date-fns'

export function SearchDialog() {
  const { activeDialog, closeDialog, journalData, selectEntry } = useJournalStore()
  const [searchText, setSearchText] = useState('')
  const [sentiment, setSentiment] = useState<Sentiment | 'all'>('all')
  const [hasAttachment, setHasAttachment] = useState(false)
  const [results, setResults] = useState<any[]>([])

  const isOpen = activeDialog === 'search'

  const handleSearch = () => {
    if (!journalData) return

    let filtered = journalData.en

    // Filter by text
    if (searchText) {
      const regex = new RegExp(searchText, 'i')
      filtered = filtered.filter((entry) => regex.test(entry.content))
    }

    // Filter by sentiment
    if (sentiment !== 'all') {
      filtered = filtered.filter((entry) => entry.sentiment === sentiment)
    }

    // Filter by attachment
    if (hasAttachment) {
      filtered = filtered.filter((entry) => entry.attachment && entry.attachment.length > 0)
    }

    setResults(filtered)
  }

  const handleSelectEntry = (entry: any) => {
    const index = journalData!.en.findIndex((e) => e === entry)
    selectEntry(entry, index)
    closeDialog()
  }

  const handleClose = () => {
    closeDialog()
    setSearchText('')
    setSentiment('all')
    setHasAttachment(false)
    setResults([])
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Search Entries</DialogTitle>
          <DialogDescription>Filter your journal entries by text, sentiment, or attachments.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="search-text">Search Text</Label>
            <Input
              id="search-text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search in entry content..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="search-sentiment">Sentiment</Label>
              <Select value={sentiment} onValueChange={(val) => setSentiment(val as Sentiment | 'all')}>
                <SelectTrigger id="search-sentiment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Happy">Happy</SelectItem>
                  <SelectItem value="Sad">Sad</SelectItem>
                  <SelectItem value="Angry">Angry</SelectItem>
                  <SelectItem value="Loved">Loved</SelectItem>
                  <SelectItem value="Excited">Excited</SelectItem>
                  <SelectItem value="Neutral">Neutral</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between pt-6">
              <Label htmlFor="has-attachment">Has Attachments</Label>
              <Switch
                id="has-attachment"
                checked={hasAttachment}
                onCheckedChange={setHasAttachment}
              />
            </div>
          </div>

          <Button onClick={handleSearch} className="w-full">
            Search
          </Button>

          {results.length > 0 && (
            <div>
              <div className="mb-2 text-sm text-muted-foreground">
                Found {results.length} {results.length === 1 ? 'entry' : 'entries'}
              </div>
              <ScrollArea className="h-[300px] rounded-md border">
                <div className="p-4 space-y-2">
                  {results.map((entry, idx) => {
                    const date = new Date(entry.entryDate)
                    const preview = entry.content.substring(0, 100) + '...'

                    return (
                      <div
                        key={idx}
                        onClick={() => handleSelectEntry(entry)}
                        className="cursor-pointer rounded-lg border p-3 hover:bg-accent transition-colors"
                      >
                        <div className="font-semibold">{format(date, 'MMM dd, yyyy')}</div>
                        <div className="text-sm text-muted-foreground line-clamp-2">{preview}</div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
