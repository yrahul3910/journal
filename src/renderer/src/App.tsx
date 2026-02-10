import { MainLayout } from '@/components/layout/MainLayout'
import { WelcomePage } from '@/components/welcome/WelcomePage'
import { useJournalStore } from '@/store/journal-store'
import { useEffect } from 'react'

function App() {
  const { theme, viewMode } = useJournalStore()

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
    <MainLayout>
      {viewMode === 'welcome' ? (
        <WelcomePage />
      ) : (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Journal View</h2>
            <p className="text-muted-foreground">Journal view will be implemented next</p>
          </div>
        </div>
      )}
    </MainLayout>
  )
}

export default App
