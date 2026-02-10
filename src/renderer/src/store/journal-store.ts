import { create } from 'zustand'
import type {
  JournalData,
  JournalEntry,
  ViewMode,
  DialogType,
  SearchFilters,
  StatisticsFilter
} from '../types/journal'

interface JournalStore {
  // Core data
  journalData: JournalData | null
  currentFilePath: string | null
  password: string | null
  currentFileVersion: number | null
  encryptedData: string | null

  // UI state
  viewMode: ViewMode
  activeDialog: DialogType
  theme: 'light' | 'dark'
  selectedEntry: JournalEntry | null
  selectedEntryIndex: number | null
  searchFilters: SearchFilters
  statisticsFilter: StatisticsFilter

  // Edit entry state
  editingEntry: JournalEntry | null
  isNewEntry: boolean
  encodedImages: string[]

  // Actions - Data management
  setJournalData: (data: JournalData | null) => void
  addEntry: (entry: JournalEntry) => void
  updateEntry: (index: number, entry: JournalEntry) => void
  deleteEntry: (index: number) => void
  clearJournal: () => void

  // Actions - File management
  setCurrentFilePath: (path: string | null) => void
  setPassword: (password: string | null) => void
  setCurrentFileVersion: (version: number | null) => void
  setEncryptedData: (data: string | null) => void

  // Actions - UI
  setViewMode: (mode: ViewMode) => void
  openDialog: (dialog: DialogType) => void
  closeDialog: () => void
  setTheme: (theme: 'light' | 'dark') => void
  selectEntry: (entry: JournalEntry | null, index: number | null) => void
  setSearchFilters: (filters: SearchFilters) => void
  setStatisticsFilter: (filter: StatisticsFilter) => void

  // Actions - Edit entry
  setEditingEntry: (entry: JournalEntry | null) => void
  setIsNewEntry: (isNew: boolean) => void
  setEncodedImages: (images: string[]) => void
  clearEditState: () => void

  // Computed
  getEntriesByYear: () => Record<number, JournalEntry[]>
  getFilteredEntries: () => JournalEntry[]
  getEntryCount: () => number
}

export const useJournalStore = create<JournalStore>((set, get) => ({
  // Initial state
  journalData: null,
  currentFilePath: null,
  password: null,
  currentFileVersion: null,
  encryptedData: null,
  viewMode: 'welcome',
  activeDialog: null,
  theme: 'light',
  selectedEntry: null,
  selectedEntryIndex: null,
  searchFilters: {},
  statisticsFilter: {},
  editingEntry: null,
  isNewEntry: false,
  encodedImages: [],

  // Data management actions
  setJournalData: (data) => set({ journalData: data }),

  addEntry: (entry) =>
    set((state) => {
      if (!state.journalData) return state
      const newEntries = [...state.journalData.en, entry]
      // Sort by date (most recent first)
      newEntries.sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime())
      return {
        journalData: {
          ...state.journalData,
          en: newEntries
        }
      }
    }),

  updateEntry: (index, entry) =>
    set((state) => {
      if (!state.journalData) return state
      const newEntries = [...state.journalData.en]
      newEntries[index] = entry
      // Re-sort after update
      newEntries.sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime())
      return {
        journalData: {
          ...state.journalData,
          en: newEntries
        }
      }
    }),

  deleteEntry: (index) =>
    set((state) => {
      if (!state.journalData) return state
      const newEntries = state.journalData.en.filter((_, i) => i !== index)
      return {
        journalData: {
          ...state.journalData,
          en: newEntries
        }
      }
    }),

  clearJournal: () =>
    set({
      journalData: null,
      currentFilePath: null,
      password: null,
      currentFileVersion: null,
      encryptedData: null,
      selectedEntry: null,
      selectedEntryIndex: null,
      viewMode: 'welcome'
    }),

  // File management actions
  setCurrentFilePath: (path) => set({ currentFilePath: path }),
  setPassword: (password) => set({ password }),
  setCurrentFileVersion: (version) => set({ currentFileVersion: version }),
  setEncryptedData: (data) => set({ encryptedData: data }),

  // UI actions
  setViewMode: (mode) => set({ viewMode: mode }),
  openDialog: (dialog) => set({ activeDialog: dialog }),
  closeDialog: () => set({ activeDialog: null }),
  setTheme: (theme) => {
    set({ theme })
    // Apply theme to document
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  },
  selectEntry: (entry, index) => set({ selectedEntry: entry, selectedEntryIndex: index }),
  setSearchFilters: (filters) => set({ searchFilters: filters }),
  setStatisticsFilter: (filter) => set({ statisticsFilter: filter }),

  // Edit entry actions
  setEditingEntry: (entry) => set({ editingEntry: entry }),
  setIsNewEntry: (isNew) => set({ isNewEntry: isNew }),
  setEncodedImages: (images) => set({ encodedImages: images }),
  clearEditState: () =>
    set({
      editingEntry: null,
      isNewEntry: false,
      encodedImages: []
    }),

  // Computed values
  getEntriesByYear: () => {
    const state = get()
    if (!state.journalData) return {}

    const entriesByYear: Record<number, JournalEntry[]> = {}
    state.journalData.en.forEach((entry) => {
      const year = new Date(entry.entryDate).getFullYear()
      if (!entriesByYear[year]) {
        entriesByYear[year] = []
      }
      entriesByYear[year].push(entry)
    })
    return entriesByYear
  },

  getFilteredEntries: () => {
    const state = get()
    if (!state.journalData) return []

    let entries = state.journalData.en

    // Apply text filter
    if (state.searchFilters.text) {
      const regex = new RegExp(state.searchFilters.text, 'i')
      entries = entries.filter((entry) => regex.test(entry.content))
    }

    // Apply sentiment filter
    if (state.searchFilters.sentiment && state.searchFilters.sentiment !== 'all') {
      entries = entries.filter((entry) => entry.sentiment === state.searchFilters.sentiment)
    }

    // Apply attachment filter
    if (state.searchFilters.hasAttachment !== undefined) {
      entries = entries.filter((entry) => {
        const hasAttachment = entry.attachment && entry.attachment.length > 0
        return hasAttachment === state.searchFilters.hasAttachment
      })
    }

    return entries
  },

  getEntryCount: () => {
    const state = get()
    return state.journalData?.en.length ?? 0
  }
}))
