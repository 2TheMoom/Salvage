'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import FinderFindCard, { FinderFind } from '@/components/ui/FinderFindCard'

// A finder's full findings list — the "Welcome back" dashboard card only
// ever shows a one-line summary (a wall of every active find gets unwieldy
// fast once someone has several going at once), so this is where the full
// picture lives. Pure DB lookup, no live re-scan.
export default function MyFindsPage() {
  const { address, isConnected } = useAccount()
  const [finds, setFinds]     = useState<FinderFind[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isConnected || !address) { setLoading(false); return }
    setLoading(true)
    fetch(`/api/finder-status?finder=${address}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setFinds(d.items || []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [address, isConnected])

  // Unsettled first (that's the actionable stuff), then settled — rather
  // than strict chronological, so a finder isn't hunting through old
  // completed finds to see what still needs attention.
  const sorted = [...finds].sort((a, b) => {
    const aDone = a.claimStatus === 'settled_for_you' || a.claimStatus === 'settled_without_you'
    const bDone = b.claimStatus === 'settled_for_you' || b.claimStatus === 'settled_without_you'
    if (aDone !== bDone) return aDone ? 1 : -1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return (
    <div className="legal-page">
      <div className="legal-container">
        <Link href="/" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--eth)' }}>
          ← Back to dashboard
        </Link>

        <h1 className="legal-title" style={{ fontSize: '1.9rem', marginTop: '22px' }}>
          Your Findings
        </h1>
        <div className="legal-updated">
          {isConnected ? `${finds.length} find${finds.length === 1 ? '' : 's'} registered` : 'Connect your wallet to see your findings'}
        </div>

        {!isConnected && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-2)', marginTop: '12px' }}>
            This page shows every contract you&apos;ve registered as a finder — connect the same wallet you used to register with.
          </div>
        )}

        {isConnected && loading && (
          <div style={{ marginTop: '24px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-2)' }}>
            Loading…
          </div>
        )}

        {isConnected && !loading && finds.length === 0 && (
          <div style={{ marginTop: '24px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-2)' }}>
            No findings registered yet. Scan a contract and register a find to see it here.
          </div>
        )}

        {isConnected && !loading && sorted.length > 0 && (
          <div style={{
            marginTop: '20px', padding: '4px 18px', borderRadius: '12px',
            background: 'var(--card)', border: '1px solid var(--border-md)',
          }}>
            {sorted.map((find) => (
              <FinderFindCard key={find.findKey} find={find} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
