import { EntryList } from '@/components/entry/EntryList'
import { EntryViewer } from '@/components/entry/EntryViewer'

export function JournalView() {
  return (
    <div className="flex h-full">
      {/* Left panel - Entry list */}
      <div className="w-1/2 border-r">
        <EntryList />
      </div>

      {/* Right panel - Entry viewer */}
      <div className="w-1/2">
        <EntryViewer />
      </div>
    </div>
  )
}
