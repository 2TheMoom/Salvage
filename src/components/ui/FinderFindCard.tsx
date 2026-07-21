'use client'

import { useState } from 'react'
import Link from 'next/link'
import ShareReceiptButton from './ShareReceiptButton'

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
  settledAt: string | null
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
  settledAt: string | null
  tokens: FinderFindToken[]
}

// 7% finder fee — matches the same approximation used app-wide (the landing
// page's example card, src/lib/outreach.ts's feeUsd) rather than a new one.
const FINDER_FEE_RATE = 0.07

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export const FINDER_STATUS_COPY: Record<FinderClaimStatus, { label: string; color: string }> = {
  pending:              { label: 'Priority locked — waiting on the victim/owner to register a claim', color: 'var(--text-2)' },
  registered_for_you:   { label: 'Claim registered — crediting you, awaiting settlement', color: 'var(--eth)' },
  settled_for_you:      { label: '✓ Settled — your 7% has been paid out', color: 'var(--green)' },
  claimed_without_you:  { label: 'A claim was registered without crediting you', color: 'var(--crimson)' },
  settled_without_you:  { label: 'Settled without crediting you', color: 'var(--crimson)' },
}

const TOKEN_REVEAL_CHUNK = 10

export default function FinderFindCard({ find, index }: { find: FinderFind; index?: number }) {
  const [expanded, setExpanded]       = useState(false)
  const [visibleCount, setVisibleCount] = useState(TOKEN_REVEAL_CHUNK)
  const statusCopy = FINDER_STATUS_COPY[find.claimStatus]
  const explorer = find.chain === 'eth' ? 'etherscan.io' : 'basescan.org'
  const multiple = find.tokens.length > 1
  const earnedUsd = find.claimStatus === 'settled_for_you' && find.valueUsd != null
    ? find.valueUsd * FINDER_FEE_RATE
    : null
  // First token matching the overall status — same "first one that has it"
  // convention already used for the top-level registerTx/settleTx fields.
  const settledToken = find.tokens.find((t) => t.claimStatus === 'settled_for_you')
  // The registration is for the scanned CONTRACT, not the tokens found
  // stranded inside it — lead with the contract's own identity.
  const contractLabel = find.contractSymbol || find.contractName || 'Unverified contract'

  return (
    <div style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          {index != null && (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.63rem', color: 'var(--text-3)',
              width: '14px', textAlign: 'right', flexShrink: 0, paddingTop: '2px',
            }}>
              {index + 1}
            </div>
          )}
          <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
            Contract found: {contractLabel}
            {earnedUsd != null ? (
              <span style={{ color: 'var(--green)', fontWeight: 400 }}> · ${earnedUsd.toFixed(2)} earned</span>
            ) : find.valueUsd != null ? (
              <span style={{ color: 'var(--text-2)', fontWeight: 400 }}> · ${find.valueUsd.toFixed(2)} stranded</span>
            ) : null}
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
          {(find.registerTx || find.settleTx) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
              {find.registerTx && (
                <a href={`https://${explorer}/tx/${find.registerTx}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--eth)' }}>
                  Registered {formatDate(find.createdAt)} ↗
                </a>
              )}
              {find.settleTx && (
                <a href={`https://${explorer}/tx/${find.settleTx}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--green)' }}>
                  Settled{find.settledAt ? ` ${formatDate(find.settledAt)}` : ''} ↗
                </a>
              )}
            </div>
          )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {find.claimStatus === 'registered_for_you' && (
            <ShareReceiptButton type="find" findKey={find.findKey} />
          )}
          {find.claimStatus === 'settled_for_you' && settledToken && (
            <ShareReceiptButton
              type="settle" findKey={find.findKey}
              token={settledToken.tokenAddress} perspective="finder"
            />
          )}
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
      </div>

      {multiple && expanded && (
        <div style={{ marginTop: '6px', paddingLeft: '14px', borderLeft: '2px solid var(--border)' }}>
          {find.tokens.slice(0, visibleCount).map((t) => {
            const tCopy = FINDER_STATUS_COPY[t.claimStatus]
            const tEarned = t.claimStatus === 'settled_for_you' && t.valueUsd != null
              ? t.valueUsd * FINDER_FEE_RATE
              : null
            return (
              <div key={t.tokenAddress} style={{ padding: '5px 0', fontFamily: 'var(--font-mono)', fontSize: '0.66rem' }}>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{t.tokenSymbol || 'token'}</span>
                {tEarned != null ? (
                  <span style={{ color: 'var(--green)' }}> · ${tEarned.toFixed(2)} earned</span>
                ) : t.valueUsd != null ? (
                  <span style={{ color: 'var(--text-2)' }}> · ${t.valueUsd.toFixed(2)}</span>
                ) : null}
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
