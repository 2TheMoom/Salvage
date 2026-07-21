'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import SonarLogo from '@/components/ui/SonarLogo'
import ConnectButton from '@/components/ui/ConnectButton'
import BackLink from '@/components/ui/BackLink'
import PageNav from '@/components/ui/PageNav'
import ShareReceiptButton from '@/components/ui/ShareReceiptButton'

const PAGE_SIZE = 5

// Matches the router's own fee schedule (SalvageRecoveryRouter.sol) — same
// 90%/95% split already used in RecoveryClaimPanel/OwnerClaimPanel/
// ShareReceiptButton, not a new approximation.
const VICTIM_BROKERED_RATE = 0.90
const VICTIM_SELF_RATE = 0.95

interface Claim {
  claim_id: string
  chain: 'eth' | 'base'
  token_address: string
  token_symbol: string | null
  finder_address: string | null
  loss_tx_hash: string
  value_usd: number | null
  status: string
  settle_tx: string | null
  settled_at: string | null
  recipient_contract: string | null
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// The victim/owner's full recovery history — "Your Recoveries" on the
// dashboard only ever shows lifetime totals, no itemized list, so this is
// where the full picture (and the ability to re-share a past recovery)
// lives. Settled only: pending claims already surface as actionable items
// via the dashboard's own OwnerStatusPanel, not duplicated here.
export default function RecoveriesPage() {
  const { address, isConnected } = useAccount()
  const [claims, setClaims]   = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)

  useEffect(() => {
    if (!isConnected || !address) { setLoading(false); return }
    setLoading(true)
    fetch(`/api/claims?victim=${address}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setClaims((d.claims || []).filter((c: Claim) => c.status === 'settled')) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [address, isConnected])

  useEffect(() => { setPage(1) }, [address])

  const sorted = [...claims].sort((a, b) =>
    new Date(b.settled_at || 0).getTime() - new Date(a.settled_at || 0).getTime()
  )

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const payoutFor = (c: Claim) => (c.value_usd || 0) * (c.finder_address ? VICTIM_BROKERED_RATE : VICTIM_SELF_RATE)
  const totalRecoveredUsd = claims.reduce((sum, c) => sum + payoutFor(c), 0)

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
          Your Recoveries
        </h1>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: '28px' }}>
          {isConnected ? `${claims.length} recover${claims.length === 1 ? 'y' : 'ies'} settled` : 'Connect your wallet to see your recoveries'}
        </div>

        {!isConnected && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-2)' }}>
            This page shows every recovery settled to your wallet — connect the same wallet you recovered with.
          </div>
        )}

        {isConnected && loading && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-2)' }}>
            Loading…
          </div>
        )}

        {isConnected && !loading && claims.length === 0 && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-2)' }}>
            No recoveries settled yet.
          </div>
        )}

        {isConnected && !loading && claims.length > 0 && (
          <div className="e-body" style={{
            padding: '18px 22px', marginBottom: '22px', borderRadius: '12px',
            background: 'var(--card)', border: '1px solid var(--border-md)',
          }}>
            <div className="e-row"><span className="e-key">Recoveries settled</span><span className="e-val">{claims.length}</span></div>
            <div className="e-div" />
            <div className="e-total">
              <span className="e-total-key">Total recovered</span>
              <span className="e-total-val">${totalRecoveredUsd.toFixed(2)}</span>
            </div>
          </div>
        )}

        {isConnected && !loading && sorted.length > 0 && (
          <div style={{
            padding: '4px 18px', borderRadius: '12px',
            background: 'var(--card)', border: '1px solid var(--border-md)',
          }}>
            {paged.map((claim, i) => (
              <RecoveryRow key={claim.claim_id} claim={claim} index={i} />
            ))}
            <PageNav page={page} totalPages={totalPages} onChange={setPage} />
          </div>
        )}
      </div>
    </div>
  )
}

function RecoveryRow({ claim, index }: { claim: Claim; index: number }) {
  const payout = (claim.value_usd || 0) * (claim.finder_address ? VICTIM_BROKERED_RATE : VICTIM_SELF_RATE)
  const explorer = claim.chain === 'eth' ? 'etherscan.io' : 'basescan.org'

  return (
    <div style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.63rem', color: 'var(--text-3)',
            width: '14px', textAlign: 'right', flexShrink: 0, paddingTop: '2px',
          }}>
            {index + 1}
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
              {claim.token_symbol || 'tokens'}
              <span style={{ color: 'var(--green)', fontWeight: 400 }}> · ${payout.toFixed(2)} recovered</span>
            </div>
            {claim.settle_tx && (
              <a href={`https://${explorer}/tx/${claim.settle_tx}`} target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--green)' }}>
                Settled{claim.settled_at ? ` ${formatDate(claim.settled_at)}` : ''} ↗
              </a>
            )}
          </div>
        </div>
        <ShareReceiptButton
          type="settle" perspective="victim"
          chain={claim.chain} token={claim.token_address}
          lossTxHash={claim.loss_tx_hash} recipientContract={claim.recipient_contract || undefined}
          amountUsd={payout}
        />
      </div>
    </div>
  )
}
