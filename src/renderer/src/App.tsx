import { MainLayout } from '@/components/layout/MainLayout'
import { WelcomePage } from '@/components/welcome/WelcomePage'
import { JournalView } from '@/components/journal/JournalView'
import { DialogManager } from '@/components/dialogs/DialogManager'
import { useJournalStore } from '@/store/journal-store'
import { useEffect } from 'react'
import { Toaster } from 'sonner'

function App() {
  const { viewMode } = useJournalStore()

  // Apply theme on mount and when it changes
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) {
      useJournalStore.getState().setTheme(savedTheme)
    } else {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      useJournalStore.getState().setTheme(prefersDark ? 'dark' : 'light')
    }
  }, [])

  return (
    <>
      <MainLayout>
        {viewMode === 'welcome' ? <WelcomePage /> : <JournalView />}
      </MainLayout>
      <DialogManager />
      <Toaster richColors position="top-right" />
    </>
  )
}

export default App
