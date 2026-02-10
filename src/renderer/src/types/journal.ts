export type Sentiment = 'Happy' | 'Angry' | 'Sad' | 'Neutral' | 'Loved' | 'Excited'

export interface JournalEntry {
  entryDate: string | Date
  content: string
  sentiment: Sentiment
  attachment?: string[]
  nsfw?: boolean
}

export interface JournalData {
  version?: number
  en: JournalEntry[]
}

export type ViewMode = 'welcome' | 'journal'

export type DialogType =
  | 'edit'
  | 'newJournal'
  | 'decrypt'
  | 'settings'
  | 'search'
  | 'statistics'
  | 'about'
  | 'intro'
  | 'preview'
  | 'error'
  | null

export interface SearchFilters {
  text?: string
  sentiment?: Sentiment | 'all'
  hasAttachment?: boolean
}

export interface StatisticsFilter {
  year?: number | 'all'
}

export const SENTIMENT_COLORS: Record<Sentiment | 'Unknown', string> = {
  Happy: 'green',
  Angry: 'red',
  Sad: '#FBCA04',
  Neutral: 'gray',
  Loved: 'hotpink',
  Excited: 'lime',
  Unknown: 'black'
}

export const VERSION_NUMBER = 6.0
