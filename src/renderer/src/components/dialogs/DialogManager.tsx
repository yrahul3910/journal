import { NewJournalDialog } from './NewJournalDialog'
import { DecryptDialog } from './DecryptDialog'
import { SettingsDialog } from './SettingsDialog'
import { AboutDialog } from './AboutDialog'
import { ErrorDialog } from './ErrorDialog'

export function DialogManager() {
  return (
    <>
      <NewJournalDialog />
      <DecryptDialog />
      <SettingsDialog />
      <AboutDialog />
      <ErrorDialog />
      {/* More dialogs will be added here */}
    </>
  )
}
