'use client'

import { useState } from 'react'
import { VictimScanResult, VictimFinding } from '@/types'
import { truncateAddress } from '@/lib/utils'
import RecoveryClaimPanel from '@/components/ui/RecoveryClaimPanel'

interface VictimResultCardProps {
  result: VictimScanResult
}

function formatUsd(value: number): string {
  if (value === 0) return '$0'
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(2)}`
}

function formatAmount(amount: string, symbol: string): string {
  const num = parseFloat(amount)
  if (!num)                return `0 ${symbol}`
  if (num >= 1_000_000)    return `${(num / 1_000_000).toFixed(2)}M ${symbol}`
  if (num >= 1_000)        return `${(num / 1_000).toFixed(2)}K ${symbol}`
  if (num < 0.0001)        return `<0.0001 ${symbol}`
  return `${num.toFixed(4)} ${symbol}`
}

function statusChip(f: VictimFinding) {
  if (f.triageStatus === 'recoverable') {
    return { text: '✓ Recoverable', color: 'var(--green)' }
  }
  if (f.triageStatus === 'needs_action') {
    return { text: '⚠ Needs action', color: 'var(--amber)' }
  }
  if (f.triageStatus === 'unrecoverable') {
    return { text: '✗ Unrecoverable', color: 'var(--crimson)' }
  }
  return { text: '· Not triaged', color: 'var(--text-3)' }
}

function buildVictimOutreach(f: VictimFinding, chain: string): string {
  const chainName = chain === 'eth' ? 'Ethereum' : 'Base'
  const rescue = f.rescueFunction
    ? `Your contract's ABI includes ${f.rescueFunction}(), so the tokens can be returned directly by the contract owner — no upgrade needed.`
    : `We understand recovery may require action from the contract owner or governance.`
  return `Subject: Recovery request — ${f.amount} ${f.tokenSymbol} mistakenly sent to your contract

Hello,

I mistakenly sent ${formatAmount(f.amount, f.tokenSymbol)} (${formatUsd(f.valueUsd)}) to the contract ${f.recipientContract} on ${chainName}.

Transaction: ${f.txHash}
${f.timestamp ? `Date: ${f.timestamp.slice(0, 10)}` : ''}
The contract currently holds ${f.contractStillHolds} ${f.tokenSymbol}.

${rescue}

I'd be grateful if you could help return these funds. Happy to verify ownership of the sending wallet by signing a message.

Found via Salvage — salvage-olive.vercel.app`
}

function FindingRow({ finding, chain, victimWallet }: { finding: VictimFinding; chain: string; victimWallet: string }) {
  const [copied, setCopied] = useState(false)
  const chip = statusChip(finding)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildVictimOutreach(finding, chain))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div style={{
      padding: '14px', borderRadius: '8px', marginBottom: '8px',
      background: 'var(--card-inner)', border: '1px solid var(--border)',
    }}>
      {/* Top: amount + value + status */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: '10px',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: '1.05rem',
            fontWeight: 700, color: 'var(--text)',
          }}>
            {formatAmount(finding.amount, finding.tokenSymbol)}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
            color: 'var(--text-2)', marginTop: '2px',
          }}>
            {finding.tokenName}
            {finding.timestamp ? ` · ${finding.timestamp.slice(0, 10)}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: '1.05rem',
            fontWeight: 700, color: 'var(--text)',
          }}>
            {formatUsd(finding.valueUsd)}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
            fontWeight: 600, color: chip.color, marginTop: '2px',
          }}>
            {chip.text}
          </div>
        </div>
      </div>

      {/* Details */}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.66rem',
        color: 'var(--text-2)', lineHeight: 1.8,
      }}>
        <div>
          Sent to{' '}
          <span style={{ color: 'var(--text)' }}>
            {finding.recipientName || 'Unknown Contract'} · {truncateAddress(finding.recipientContract)}
          </span>
          {finding.sentToSelf && (
            <span style={{
              marginLeft: '6px', padding: '1px 6px', borderRadius: '4px',
              background: 'var(--eth-soft)', border: '1px solid var(--eth-border)',
              color: 'var(--eth)', fontSize: '0.58rem', fontWeight: 600,
            }}>
              token&apos;s own contract
            </span>
          )}
        </div>
        <div>
          Contract still holds{' '}
          <span style={{ color: 'var(--text)' }}>
            {finding.contractStillHolds} {finding.tokenSymbol}
          </span>
          {finding.rescueFunction && (
            <span style={{ color: 'var(--green)' }}>
              {' '}· {finding.rescueFunction}() available
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <button
          onClick={handleCopy}
          style={{
            padding: '7px 12px', borderRadius: '6px',
            border: '1px solid var(--border)', background: 'var(--card)',
            cursor: 'pointer', fontFamily: 'var(--font-mono)',
            fontSize: '0.64rem', fontWeight: 600, color: 'var(--text)',
          }}
        >
          {copied ? '✓ Copied' : 'Copy Recovery Request'}
        </button>
        <a
          href={explorerTxUrl(finding.txHash, chain)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '7px 12px', borderRadius: '6px',
            border: '1px solid var(--border)', background: 'transparent',
            fontFamily: 'var(--font-mono)', fontSize: '0.64rem',
            fontWeight: 600, color: 'var(--text-2)', textDecoration: 'none',
          }}
        >
          View Tx ↗
        </a>
      </div>

      {(finding.triageStatus === 'recoverable' || finding.triageStatus === 'needs_action' ||
        (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('test') === '1')) && (
        <RecoveryClaimPanel
          finding={finding}
          victimWallet={victimWallet}
          chain={chain as 'eth' | 'base'}
        />
      )}
    </div>
  )
}

function explorerTxUrl(txHash: string, chain: string): string {
  const base = chain === 'eth' ? 'https://etherscan.io' : 'https://basescan.org'
  return `${base}/tx/${txHash}`
}

export default function VictimResultCard({ result }: VictimResultCardProps) {
  const hasFindings = result.findings.length > 0

  return (
    <div className="r-card">
      {/* Summary header */}
      <div style={{
        padding: '18px 26px', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-2)',
          }}>
            Lost Token Report
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
            color: 'var(--text-2)', marginTop: '4px',
          }}>
            {truncateAddress(result.wallet)} · {result.chain === 'eth' ? 'Ethereum' : 'Base'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: '1.5rem',
            fontWeight: 700, color: hasFindings ? 'var(--crimson)' : 'var(--green)',
          }}>
            {formatUsd(result.totalLostUsd)}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
            color: 'var(--text-3)', marginTop: '1px',
          }}>
            {result.findings.length} mistaken transfer{result.findings.length === 1 ? '' : 's'} found
          </div>
        </div>
      </div>

      {/* Findings */}
      <div style={{ padding: '16px 26px' }}>
        {hasFindings ? (
          result.findings.map((f, i) => (
            <FindingRow key={`${f.txHash}-${i}`} finding={f} chain={result.chain} victimWallet={result.wallet} />
          ))
        ) : (
          <div style={{
            padding: '20px 0', textAlign: 'center',
            fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
            color: 'var(--text-2)', lineHeight: 1.7,
          }}>
            ✓ No mistaken transfers detected.<br />
            This wallet has never sent tokens directly to a token contract.
          </div>
        )}
      </div>
    </div>
  )
}