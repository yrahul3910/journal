import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useJournalStore } from '@/store/journal-store'
import { format } from 'date-fns'
import { CalendarIcon, Smile, Eye } from 'lucide-react'
import { EmojiPicker } from './EmojiPicker'
import { FileDropZone } from './FileDropZone'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { Sentiment, JournalEntry } from '@/types/journal'

export function EditEntryDialog() {
  const {
    activeDialog,
    closeDialog,
    isNewEntry,
    editingEntry,
    encodedImages,
    setEncodedImages,
    addEntry,
    updateEntry,
    selectedEntryIndex,
    journalData,
    openDialog
  } = useJournalStore()

  const [date, setDate] = useState<Date>(new Date())
  const [sentiment, setSentiment] = useState<Sentiment>('Neutral')
  const [content, setContent] = useState('')
  const [nsfw, setNsfw] = useState(false)
  const [error, setError] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isOpen = activeDialog === 'edit'

  // Load editing entry data
  useEffect(() => {
    if (isOpen && editingEntry) {
      setDate(new Date(editingEntry.entryDate))
      setSentiment(editingEntry.sentiment)
      setContent(editingEntry.content)
      setNsfw(editingEntry.nsfw || false)
      setEncodedImages(editingEntry.attachment || [])
    } else if (isOpen && isNewEntry) {
      // Reset for new entry
      setDate(new Date())
      setSentiment('Neutral')
      setContent('')
      setNsfw(false)
      setEncodedImages([])
    }
  }, [isOpen, editingEntry, isNewEntry])

  const handleSubmit = () => {
    setError('')

    // Validate date for new entries
    if (isNewEntry && journalData) {
      const dateTime = date.getTime()
      const duplicate = journalData.en.some(
        (entry) => new Date(entry.entryDate).getTime() === dateTime
      )
      if (duplicate) {
        setError('Multiple entries for the same date not allowed.')
        return
      }
    }

    const entry: JournalEntry = {
      entryDate: date,
      content,
      sentiment,
      attachment: encodedImages.length > 0 ? encodedImages : undefined,
      nsfw: nsfw || undefined
    }

    if (isNewEntry) {
      addEntry(entry)
    } else if (selectedEntryIndex !== null) {
      updateEntry(selectedEntryIndex, entry)
    }

    closeDialog()
    resetForm()
  }

  const resetForm = () => {
    setDate(new Date())
    setSentiment('Neutral')
    setContent('')
    setNsfw(false)
    setError('')
    setShowEmojiPicker(false)
  }

  const handleClose = () => {
    closeDialog()
    resetForm()
  }

  const handleEmojiSelect = (shortcode: string) => {
    // Insert emoji shortcode at cursor position
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart
      const end = textareaRef.current.selectionEnd
      const newContent = content.substring(0, start) + shortcode + content.substring(end)
      setContent(newContent)
      // Reset cursor position after the emoji
      setTimeout(() => {
        textareaRef.current?.setSelectionRange(
          start + shortcode.length,
          start + shortcode.length
        )
        textareaRef.current?.focus()
      }, 0)
    } else {
      setContent(content + shortcode)
    }
  }

  const handlePreview = () => {
    openDialog('preview')
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNewEntry ? 'New Entry' : 'Update Entry'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="grid grid-cols-2 gap-4">
            {/* Date Picker */}
            <div>
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(date, 'PPP')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} />
                </PopoverContent>
              </Popover>
            </div>

            {/* Sentiment Selector */}
            <div>
              <Label>How are you feeling?</Label>
              <Select value={sentiment} onValueChange={(val) => setSentiment(val as Sentiment)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Happy">Happy 😊</SelectItem>
                  <SelectItem value="Sad">Sad 😢</SelectItem>
                  <SelectItem value="Angry">Angry 😠</SelectItem>
                  <SelectItem value="Loved">Loved 😍</SelectItem>
                  <SelectItem value="Excited">Excited 🎉</SelectItem>
                  <SelectItem value="Neutral">Neutral 😐</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Entry Content */}
          <div>
            <Label>Your entry</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Supports Markdown: *italic*, **bold**, [link](url)
            </p>
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's on your mind?"
              rows={12}
              className="font-mono"
            />
          </div>

          {/* Emoji Picker Toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              <Smile className="h-4 w-4 mr-2" />
              {showEmojiPicker ? 'Hide' : 'Add'} Emoji
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handlePreview}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
          </div>

          {/* Emoji Picker */}
          {showEmojiPicker && (
            <Collapsible open={showEmojiPicker}>
              <CollapsibleContent>
                <EmojiPicker onSelect={handleEmojiSelect} />
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* File Drop Zone */}
          <div>
            <Label>Attachments</Label>
            <FileDropZone files={encodedImages} onChange={setEncodedImages} />
          </div>

          {/* NSFW Toggle */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={nsfw ? 'destructive' : 'outline'}
              size="sm"
              onClick={() => setNsfw(!nsfw)}
            >
              {nsfw ? 'NSFW Enabled' : 'Mark as NSFW'}
            </Button>
            {nsfw && (
              <span className="text-xs text-muted-foreground">
                This entry will be marked as sensitive content
              </span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>{isNewEntry ? 'Add Entry' : 'Update Entry'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
