'use client'

import { useState, useEffect } from 'react'
import Landing from '@/components/layout/Landing'
import Dashboard from '@/components/layout/Dashboard'
import { Chain } from '@/types'

type Page = 'landing' | 'dashboard'

// Parses the `?scan=chain:0xaddress` deep link used in outreach messages,
// so a contract owner clicking through from a finder's message lands
// straight on their own scan result instead of a blank homepage.
function parseInitialScan(): { chain: Chain; address: string } | null {
  const params = new URLSearchParams(window.location.search)
  const raw = params.get('scan')
  if (!raw) return null
  const [chainStr, address] = raw.split(':')
  if (
    (chainStr === 'eth' || chainStr === 'base') &&
    address && /^0x[a-fA-F0-9]{40}$/.test(address)
  ) {
    return { chain: chainStr, address }
  }
  return null
}

export default function Home() {
  // Initialise from sessionStorage so refresh keeps you on dashboard
  const [page, setPage] = useState<Page>('landing')
  const [hydrated, setHydrated] = useState(false)
  const [initialScan, setInitialScan] = useState<{ chain: Chain; address: string } | null>(null)
  const [scrollTarget, setScrollTarget] = useState<string | null>(null)

  useEffect(() => {
    const scan = parseInitialScan()
    if (scan) {
      setInitialScan(scan)
      setPage('dashboard')
      sessionStorage.setItem('salvage_page', 'dashboard')
    } else {
      const saved = sessionStorage.getItem('salvage_page') as Page | null
      if (saved === 'dashboard') setPage('dashboard')
    }
    setHydrated(true)
  }, [])

  const goToDashboard = () => {
    setPage('dashboard')
    sessionStorage.setItem('salvage_page', 'dashboard')
  }

  const goToLeaderboard = () => {
    setScrollTarget('leaderboard')
    goToDashboard()
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
        <Landing onOpenDashboard={goToDashboard} onOpenLeaderboard={goToLeaderboard} />
      )}
      {page === 'dashboard' && (
        <Dashboard
          onGoLanding={goToLanding}
          connectedWallet={null}
          initialScan={initialScan}
          scrollTarget={scrollTarget}
          onScrollHandled={() => setScrollTarget(null)}
        />
      )}
    </>
  )
}
