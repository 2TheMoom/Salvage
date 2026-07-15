'use client'

import { useState } from 'react'
import Link from 'next/link'

export type FinderClaimStatus =
  | 'pending'
  | 'registered_for_you'
  | 'settled_for_you'
  | 'claimed_without_you'
  | 'settled_without_you'

export interface FinderFindToken {
  tokenAddress: string
  tokenSymbol: string | null
  valueUsd: number | null
  claimStatus: FinderClaimStatus
  registerTx: string | null
  settleTx: string | null
}

export interface FinderFind {
  findKey: string
  chain: string
  valueUsd: number | null
  recipientContract: string
  contractName: string | null
  contractSymbol: string | null
  createdAt: string
  claimStatus: FinderClaimStatus
  registerTx: string | null
  settleTx: string | null
  tokens: FinderFindToken[]
}

export const FINDER_STATUS_COPY: Record<FinderClaimStatus, { label: string; color: string }> = {
  pending:              { label: 'Priority locked — waiting on the victim/owner to register a claim', color: 'var(--text-2)' },
  registered_for_you:   { label: 'Claim registered — crediting you, awaiting settlement', color: 'var(--eth)' },
  settled_for_you:      { label: '✓ Settled — your 7% has been paid out', color: 'var(--green)' },
  claimed_without_you:  { label: 'A claim was registered without crediting you', color: 'var(--crimson)' },
  settled_without_you:  { label: 'Settled without crediting you', color: 'var(--crimson)' },
}

const TOKEN_REVEAL_CHUNK = 10

export default function FinderFindCard({ find }: { find: FinderFind }) {
  const [expanded, setExpanded]       = useState(false)
  const [visibleCount, setVisibleCount] = useState(TOKEN_REVEAL_CHUNK)
  const statusCopy = FINDER_STATUS_COPY[find.claimStatus]
  const explorer = find.chain === 'eth' ? 'etherscan.io' : 'basescan.org'
  const txHash = find.settleTx || find.registerTx
  const multiple = find.tokens.length > 1
  // The registration is for the scanned CONTRACT, not the tokens found
  // stranded inside it — lead with the contract's own identity.
  const contractLabel = find.contractSymbol || find.contractName || 'Unverified contract'

  return (
    <div style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
            Contract found: {contractLabel}
            {find.valueUsd != null && <span style={{ color: 'var(--text-2)', fontWeight: 400 }}> · ${find.valueUsd.toFixed(2)} stranded</span>}
            <span style={{ color: 'var(--text-2)', fontWeight: 400 }}> · {find.recipientContract.slice(0, 6)}…{find.recipientContract.slice(-4)}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-2)' }}>
            Stranded:{' '}
            {multiple ? (
              <span
                style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
                onClick={() => setExpanded((e) => !e)}
              >
                {find.tokens.length} tokens {expanded ? '▾' : '▸'}
              </span>
            ) : (
              find.tokens[0]?.tokenSymbol || 'token'
            )}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: statusCopy.color }}>
            {statusCopy.label}
          </div>
          {txHash && (
            <a href={`https://${explorer}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--eth)' }}>
              View transaction ↗
            </a>
          )}
        </div>
        <Link
          href={`/find/${encodeURIComponent(find.findKey)}`}
          style={{
            padding: '7px 12px', borderRadius: '6px', whiteSpace: 'nowrap',
            background: 'var(--eth)', color: '#fff', textDecoration: 'none',
            fontFamily: 'var(--font-mono)', fontSize: '0.64rem', fontWeight: 600,
          }}
        >
          View Find
        </Link>
      </div>

      {multiple && expanded && (
        <div style={{ marginTop: '6px', paddingLeft: '14px', borderLeft: '2px solid var(--border)' }}>
          {find.tokens.slice(0, visibleCount).map((t) => {
            const tCopy = FINDER_STATUS_COPY[t.claimStatus]
            return (
              <div key={t.tokenAddress} style={{ padding: '5px 0', fontFamily: 'var(--font-mono)', fontSize: '0.66rem' }}>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{t.tokenSymbol || 'token'}</span>
                {t.valueUsd != null && <span style={{ color: 'var(--text-2)' }}> · ${t.valueUsd.toFixed(2)}</span>}
                <span style={{ color: tCopy.color }}> · {tCopy.label}</span>
              </div>
            )
          })}
          {find.tokens.length > visibleCount && (
            <div
              onClick={() => setVisibleCount((n) => n + TOKEN_REVEAL_CHUNK)}
              style={{
                marginTop: '4px', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                fontSize: '0.64rem', color: 'var(--eth)', fontWeight: 600,
              }}
            >
              ▾ Show {Math.min(TOKEN_REVEAL_CHUNK, find.tokens.length - visibleCount)} more
              ({find.tokens.length - visibleCount} remaining)
            </div>
          )}
          {visibleCount > TOKEN_REVEAL_CHUNK && (
            <div
              onClick={() => setVisibleCount(TOKEN_REVEAL_CHUNK)}
              style={{
                marginTop: '4px', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                fontSize: '0.64rem', color: 'var(--text-3)', fontWeight: 600,
              }}
            >
              ▴ Show less
            </div>
          )}
        </div>
      )}
    </div>
  )
}
