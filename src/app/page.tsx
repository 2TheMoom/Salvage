'use client'

import { useState } from 'react'
import Landing from '@/components/layout/Landing'
import Dashboard from '@/components/layout/Dashboard'

type Page = 'landing' | 'dashboard'

export default function Home() {
  const [page, setPage] = useState<Page>('landing')

  return (
    <>
      {page === 'landing' && (
        <Landing onOpenDashboard={() => setPage('dashboard')} />
      )}
      {page === 'dashboard' && (
        <Dashboard
          onGoLanding={() => setPage('landing')}
          connectedWallet={null}
        />
      )}
    </>
  )
}