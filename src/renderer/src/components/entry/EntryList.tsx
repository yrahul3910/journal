import { useJournalStore } from '@/store/journal-store'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EntryCard } from './EntryCard'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

export function EntryList() {
  const { journalData, selectedEntryIndex, selectEntry } = useJournalStore()
  const entriesByYear = useJournalStore((state) => state.getEntriesByYear())

  // Track which years are open (all open by default)
  const years = Object.keys(entriesByYear).sort((a, b) => Number(b) - Number(a))
  const [openYears, setOpenYears] = useState<Record<string, boolean>>(
    years.reduce((acc, year) => ({ ...acc, [year]: true }), {})
  )

  if (!journalData || journalData.en.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>No entries yet. Create your first entry!</p>
      </div>
    )
  }

  const toggleYear = (year: string) => {
    setOpenYears((prev) => ({ ...prev, [year]: !prev[year] }))
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        {years.map((year) => {
          const entries = entriesByYear[Number(year)]
          const isOpen = openYears[year]

          return (
            <Collapsible key={year} open={isOpen} onOpenChange={() => toggleYear(year)}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full hover:bg-accent p-2 rounded-lg">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span className="font-bold text-lg">{year}</span>
                <span className="text-sm text-muted-foreground">({entries.length})</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2">
                {entries.map((entry, idx) => {
                  // Find the actual index in the full array
                  const actualIndex = journalData.en.findIndex((e) => e === entry)
                  const isSelected = actualIndex === selectedEntryIndex

                  return (
                    <EntryCard
                      key={actualIndex}
                      entry={entry}
                      isSelected={isSelected}
                      onClick={() => selectEntry(entry, actualIndex)}
                    />
                  )
                })}
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </div>
    </ScrollArea>
  )
}
