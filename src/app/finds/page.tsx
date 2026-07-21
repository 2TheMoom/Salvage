'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import SonarLogo from '@/components/ui/SonarLogo'
import ConnectButton from '@/components/ui/ConnectButton'
import BackLink from '@/components/ui/BackLink'
import PageNav from '@/components/ui/PageNav'
import FinderFindCard, { FinderFind } from '@/components/ui/FinderFindCard'

const PAGE_SIZE = 5

// A finder's full findings list — the "Welcome back" dashboard card only
// ever shows a one-line summary (a wall of every active find gets unwieldy
// fast once someone has several going at once), so this is where the full
// picture lives. Pure DB lookup, no live re-scan. Uses the same nav shell as
// the dashboard rather than the bare legal-page layout, since this is a real
// part of the app a finder navigates to and from, not a static document.
export default function MyFindsPage() {
  const { address, isConnected } = useAccount()
  const [finds, setFinds]     = useState<FinderFind[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)

  useEffect(() => {
    if (!isConnected || !address) { setLoading(false); return }
    setLoading(true)
    fetch(`/api/finder-status?finder=${address}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setFinds(d.items || []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [address, isConnected])

  useEffect(() => { setPage(1) }, [address])

  // Unsettled first (that's the actionable stuff), then settled — rather
  // than strict chronological, so a finder isn't hunting through old
  // completed finds to see what still needs attention.
  const sorted = [...finds].sort((a, b) => {
    const aDone = a.claimStatus === 'settled_for_you' || a.claimStatus === 'settled_without_you'
    const bDone = b.claimStatus === 'settled_for_you' || b.claimStatus === 'settled_without_you'
    if (aDone !== bDone) return aDone ? 1 : -1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div id="dashboard">
      <nav className="d-nav">
        <Link href="/" className="d-logo">
          <SonarLogo size={28} variant="white" showWordmark wordmarkSize="1.2rem" />
        </Link>
        <ul className="d-nav-links">
          <li><Link href="/">Dashboard</Link></li>
        </ul>
        <div className="d-nav-right">
          <ConnectButton variant="dashboard" />
        </div>
      </nav>

      <div style={{ maxWidth: '820px', margin: '0 auto', padding: '40px 40px 80px' }}>
        <div style={{ marginBottom: '22px' }}>
          <BackLink href="/" label="Back to Dashboard" />
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: '1.9rem', fontWeight: 800,
          textTransform: 'uppercase', letterSpacing: '0.02em', color: 'var(--text)', marginBottom: '6px',
        }}>
          Your Findings
        </h1>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: '28px' }}>
          {isConnected ? `${finds.length} find${finds.length === 1 ? '' : 's'} registered` : 'Connect your wallet to see your findings'}
        </div>

        {!isConnected && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-2)' }}>
            This page shows every contract you&apos;ve registered as a finder — connect the same wallet you used to register with.
          </div>
        )}

        {isConnected && loading && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-2)' }}>
            Loading…
          </div>
        )}

        {isConnected && !loading && finds.length === 0 && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-2)' }}>
            No findings registered yet. Scan a contract and register a find to see it here.
          </div>
        )}

        {isConnected && !loading && sorted.length > 0 && (
          <div style={{
            padding: '4px 18px', borderRadius: '12px',
            background: 'var(--card)', border: '1px solid var(--border-md)',
          }}>
            {paged.map((find, i) => (
              <FinderFindCard key={find.findKey} find={find} index={i} />
            ))}
            <PageNav page={page} totalPages={totalPages} onChange={setPage} />
          </div>
        )}
      </div>
    </div>
  )
}
