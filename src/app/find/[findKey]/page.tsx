'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { truncateAddress } from '@/lib/utils'

type ClaimStatus =
  | 'pending'
  | 'registered_for_you'
  | 'settled_for_you'
  | 'claimed_without_you'
  | 'settled_without_you'

interface FindDetail {
  findKey: string
  chain: string
  tokenAddress: string
  tokenSymbol: string | null
  valueUsd: number | null
  recipientContract: string
  victimWallet: string
  lossTxHash: string
  finderAddress: string
  createdAt: string
  claimStatus: ClaimStatus
  registerTx: string | null
  settleTx: string | null
}

const STATUS_COPY: Record<ClaimStatus, { label: string; color: string }> = {
  pending:              { label: 'Priority locked — waiting on the victim/owner to register a claim', color: 'var(--text-2)' },
  registered_for_you:   { label: 'Claim registered — crediting you, awaiting settlement', color: 'var(--eth)' },
  settled_for_you:      { label: '✓ Settled — your 7% has been paid out', color: 'var(--green)' },
  claimed_without_you:  { label: 'A claim was registered without crediting you', color: 'var(--crimson)' },
  settled_without_you:  { label: 'Settled without crediting you', color: 'var(--crimson)' },
}

// A finder's own status page for a single find — pure DB lookup, no live
// re-scan, reachable directly from the proactive dashboard panel instead of
// forcing a full triage re-run just to check on something already recorded.
export default function FindDetailPage() {
  const params = useParams<{ findKey: string }>()
  const findKey = decodeURIComponent(params.findKey)

  const [find, setFind]       = useState<FindDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/finder-status?findKey=${encodeURIComponent(findKey)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setFind(d.item)
        else setError(d.error || 'Find not found')
      })
      .catch(() => setError('Failed to load find'))
      .finally(() => setLoading(false))
  }, [findKey])

  const explorer  = find?.chain === 'eth' ? 'etherscan.io' : 'basescan.org'
  const chainName = find?.chain === 'eth' ? 'Ethereum' : 'Base'

  return (
    <div className="legal-page">
      <div className="legal-container">
        <Link href="/" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--eth)' }}>
          ← Back to dashboard
        </Link>

        {loading && (
          <div style={{ marginTop: '24px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-2)' }}>
            Loading…
          </div>
        )}

        {!loading && error && (
          <div style={{ marginTop: '24px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--crimson)' }}>
            {error}
          </div>
        )}

        {!loading && find && (
          <>
            <h1 className="legal-title" style={{ fontSize: '1.9rem', marginTop: '20px' }}>
              {find.tokenSymbol || 'Token'} find
            </h1>
            <div className="legal-updated">
              Registered {new Date(find.createdAt).toLocaleDateString()} · {chainName}
            </div>

            <div style={{
              padding: '16px 18px', borderRadius: '10px', marginBottom: '24px',
              background: 'var(--card)', border: '1px solid var(--border-md)',
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: STATUS_COPY[find.claimStatus].color, marginBottom: '10px' }}>
                {STATUS_COPY[find.claimStatus].label}
              </div>

              {find.valueUsd != null && (
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)', marginBottom: '10px' }}>
                  ${find.valueUsd.toFixed(2)}
                </div>
              )}

              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-2)', lineHeight: 1.9 }}>
                <div>
                  Contract:{' '}
                  <a href={`https://${explorer}/address/${find.recipientContract}#code`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--eth)' }}>
                    {truncateAddress(find.recipientContract)} ↗
                  </a>
                </div>
                <div>Token: {truncateAddress(find.tokenAddress)}</div>
                {find.registerTx && (
                  <div>
                    Registration:{' '}
                    <a href={`https://${explorer}/tx/${find.registerTx}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--eth)' }}>
                      View transaction ↗
                    </a>
                  </div>
                )}
                {find.settleTx && (
                  <div>
                    Settlement:{' '}
                    <a href={`https://${explorer}/tx/${find.settleTx}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--eth)' }}>
                      View transaction ↗
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-2)', marginBottom: '10px' }}>
              Want the full triage details — verification status, rescue function, stranded balances? That needs a fresh scan.
            </div>
            <Link
              href={`/?scan=${find.chain}:${find.recipientContract}`}
              style={{
                display: 'inline-block', padding: '9px 14px', borderRadius: '6px',
                background: 'var(--eth)', color: '#fff', textDecoration: 'none',
                fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600,
              }}
            >
              Run a Full Scan
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
