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

interface TokenDetail {
  tokenAddress: string
  tokenSymbol: string | null
  valueUsd: number | null
  claimStatus: ClaimStatus
  registerTx: string | null
  settleTx: string | null
}

interface FindDetail {
  findKey: string
  chain: string
  valueUsd: number | null
  recipientContract: string
  contractName: string | null
  contractSymbol: string | null
  victimWallet: string
  lossTxHash: string
  finderAddress: string
  createdAt: string
  claimStatus: ClaimStatus
  tokens: TokenDetail[]
}

const STATUS_COPY: Record<ClaimStatus, { label: string; color: string; bg: string }> = {
  pending:              { label: 'Priority locked',        color: 'var(--text-2)', bg: 'var(--card-inner)' },
  registered_for_you:   { label: 'Registered · awaiting settlement', color: 'var(--eth)',    bg: 'var(--eth-soft)' },
  settled_for_you:      { label: '✓ Settled',               color: 'var(--green)',  bg: 'var(--green-soft)' },
  claimed_without_you:  { label: 'Claimed without you',     color: 'var(--crimson)', bg: 'rgba(176,28,46,0.1)' },
  settled_without_you:  { label: 'Settled without you',     color: 'var(--crimson)', bg: 'rgba(176,28,46,0.1)' },
}

const STATUS_EXPLAIN: Record<ClaimStatus, string> = {
  pending:              'Nobody has registered an on-chain claim against this yet — your priority as first finder is locked in and waiting.',
  registered_for_you:   'A claim has been registered on-chain crediting you as the finder. It settles once the receiver address is funded.',
  settled_for_you:      'This has been settled on-chain — your 7% finder fee has been paid out.',
  claimed_without_you:  'A claim exists for this token, but it does not credit you as the finder.',
  settled_without_you:  'This settled on-chain, but without crediting you as the finder.',
}

function TokenRow({ token, chain }: { token: TokenDetail; chain: string }) {
  const explorer = chain === 'eth' ? 'etherscan.io' : 'basescan.org'
  const copy = STATUS_COPY[token.claimStatus]
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 14px', borderRadius: '8px', background: 'var(--card-inner)',
      border: '1px solid var(--border)', marginBottom: '8px', gap: '12px', flexWrap: 'wrap',
    }}>
      <div>
        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.9rem' }}>
          {token.tokenSymbol || 'Unknown token'}
          {token.valueUsd != null && (
            <span style={{ color: 'var(--text-2)', fontWeight: 400 }}> · ${token.valueUsd.toFixed(2)}</span>
          )}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-3)' }}>
          {truncateAddress(token.tokenAddress)}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
          padding: '4px 9px', borderRadius: '20px', color: copy.color, background: copy.bg,
        }}>
          {copy.label}
        </span>
        {(token.settleTx || token.registerTx) && (
          <a
            href={`https://${explorer}/tx/${token.settleTx || token.registerTx}`}
            target="_blank" rel="noopener noreferrer"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--eth)' }}
          >
            tx ↗
          </a>
        )}
      </div>
    </div>
  )
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
  const overall   = find ? STATUS_COPY[find.claimStatus] : null
  // The registration is for the scanned contract itself, not whatever
  // tokens turned up stranded inside it — that's the headline identity.
  const contractLabel = find?.contractSymbol || find?.contractName || 'Unverified contract'

  return (
    <div className="legal-page">
      <div className="legal-container">
        <Link href="/" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--eth)' }}>
          ← Back to dashboard
        </Link>

        {loading && (
          <div style={{ marginTop: '32px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-2)' }}>
            Loading…
          </div>
        )}

        {!loading && error && (
          <div style={{ marginTop: '32px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--crimson)' }}>
            {error}
          </div>
        )}

        {!loading && find && overall && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '22px', flexWrap: 'wrap' }}>
              <h1 className="legal-title" style={{ fontSize: '1.9rem', marginBottom: 0 }}>
                Contract found: {contractLabel}
              </h1>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.66rem', fontWeight: 600,
                padding: '5px 11px', borderRadius: '20px', color: overall.color, background: overall.bg,
              }}>
                {overall.label}
              </span>
            </div>
            <div className="legal-updated" style={{ marginBottom: '8px' }}>
              {chainName} · Registered {new Date(find.createdAt).toLocaleDateString()}
              {find.valueUsd != null && ` · $${find.valueUsd.toFixed(2)} stranded inside`}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.7, marginBottom: '28px' }}>
              {STATUS_EXPLAIN[find.claimStatus]}
            </div>

            <div style={{
              padding: '18px 20px', borderRadius: '12px', marginBottom: '20px',
              background: 'var(--card)', border: '1px solid var(--border-md)',
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: '12px',
              }}>
                {find.tokens.length > 1 ? `${find.tokens.length} stranded tokens found inside` : 'Stranded token found inside'}
              </div>
              {find.tokens.map((token) => (
                <TokenRow key={token.tokenAddress} token={token} chain={find.chain} />
              ))}
            </div>

            <div style={{
              padding: '14px 16px', borderRadius: '10px', marginBottom: '24px',
              background: 'var(--card-inner)', border: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-2)', lineHeight: 2,
            }}>
              <div>
                Contract:{' '}
                <a href={`https://${explorer}/address/${find.recipientContract}#code`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--eth)' }}>
                  {truncateAddress(find.recipientContract)} ↗
                </a>
              </div>
              <div>Registered by: {truncateAddress(find.finderAddress)}</div>
            </div>

            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-2)', marginBottom: '10px' }}>
              Want the full triage details — verification status, rescue function, live balances? That needs a fresh scan.
            </div>
            <Link
              href={`/?scan=${find.chain}:${find.recipientContract}`}
              style={{
                display: 'inline-block', padding: '10px 16px', borderRadius: '8px',
                background: 'var(--eth)', color: '#fff', textDecoration: 'none',
                fontFamily: 'var(--font-mono)', fontSize: '0.74rem', fontWeight: 600,
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
