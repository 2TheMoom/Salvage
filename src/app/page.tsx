'use client'

import { useState, useEffect } from 'react'
import Landing from '@/components/layout/Landing'
import Dashboard from '@/components/layout/Dashboard'

type Page = 'landing' | 'dashboard'

export default function Home() {
  // Initialise from sessionStorage so refresh keeps you on dashboard
  const [page, setPage] = useState<Page>('landing')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const saved = sessionStorage.getItem('salvage_page') as Page | null
    if (saved === 'dashboard') setPage('dashboard')
    setHydrated(true)
  }, [])

  const goToDashboard = () => {
    setPage('dashboard')
    sessionStorage.setItem('salvage_page', 'dashboard')
  }

  const goToLanding = () => {
    setPage('landing')
    sessionStorage.setItem('salvage_page', 'landing')
  }

  // Prevent flash of wrong page on first render
  if (!hydrated) return null

  return (
    <>
      {page === 'landing' && (
        <Landing onOpenDashboard={goToDashboard} />
      )}
      {page === 'dashboard' && (
        <Dashboard
          onGoLanding={goToLanding}
          connectedWallet={null}
        />
      )}
    </>
  )
}