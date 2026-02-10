import { NewJournalDialog } from './NewJournalDialog'
import { DecryptDialog } from './DecryptDialog'
import { SettingsDialog } from './SettingsDialog'
import { AboutDialog } from './AboutDialog'
import { ErrorDialog } from './ErrorDialog'
import { IntroDialog } from './IntroDialog'
import { PreviewDialog } from './PreviewDialog'
import { SearchDialog } from './SearchDialog'
import { StatisticsDialog } from './StatisticsDialog'
import { EditEntryDialog } from './EditEntryDialog'
import { useJournalStore } from '@/store/journal-store'

export function DialogManager() {
  const { editingEntry } = useJournalStore()

  return (
    <>
      <NewJournalDialog />
      <DecryptDialog />
      <SettingsDialog />
      <AboutDialog />
      <ErrorDialog />
      <IntroDialog />
      <PreviewDialog content={editingEntry?.content || ''} />
      <SearchDialog />
      <StatisticsDialog />
      <EditEntryDialog />
    </>
  )
}
