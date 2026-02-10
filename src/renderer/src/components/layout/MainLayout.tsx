import { ReactNode } from 'react'
import { Titlebar } from './Titlebar'
import { MenuBar } from './MenuBar'

interface MainLayoutProps {
  children: ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Titlebar />
      <MenuBar />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
