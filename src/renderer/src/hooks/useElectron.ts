import { useEffect, useState } from 'react'

export function useElectron() {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Wait for electron API to be available
    const checkElectron = () => {
      if (window.electron) {
        setIsReady(true)
        console.log('[useElectron] Electron API is ready')
      } else {
        console.warn('[useElectron] Electron API not ready, retrying...')
        setTimeout(checkElectron, 100)
      }
    }

    checkElectron()
  }, [])

  return { electron: window.electron, isReady }
}
