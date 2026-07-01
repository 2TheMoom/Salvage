'use client'

import { useState } from 'react'
import { ScanResult, TriageCheck, StrandedToken } from '@/types'
import { truncateAddress, explorerUrl } from '@/lib/utils'
import { generateOutreachTemplate } from '@/lib/outreach'
import RegisterFindButton from '@/components/ui/RegisterFindButton'
import RecoveryGuideButton from '@/components/ui/RecoveryGuideButton'

interface ScanResultCardProps {
  result:    ScanResult
  isFounder: boolean
}

const STATUS_CONFIG = {
  recoverable:   { label: '✓ Recoverable',   className: 's-ok'   },
  needs_action:  { label: '⚠ Needs Action',  className: 's-act'  },
  unrecoverable: { label: '✗ Unrecoverable', className: 's-dead' },
}

const CHECK_CONFIG = {
  pass: { className: 'ti-ok',   icon: '✓' },
  fail: { className: 'ti-fail', icon: '✗' },
  warn: { className: 'ti-warn', icon: '!' },
}

function formatUsd(value: number): string {
  if (value === 0) return '$0'
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(2)}`
}

function formatBalance(balance: string, symbol: string): string {
  const num = parseFloat(balance)
  if (num === 0)           return `0 ${symbol}`
  if (num >= 1_000_000)    return `${(num / 1_000_000).toFixed(2)}M ${symbol}`
  if (num >= 1_000)        return `${(num / 1_000).toFixed(2)}K ${symbol}`
  if (num < 0.0001)        return `<0.0001 ${symbol}`
  return `${num.toFixed(4)} ${symbol}`
}

function TriageRow({ check }: { check: TriageCheck }) {
  const cfg = CHECK_CONFIG[check.status]
  return (
    <div className="t-row">
      <div className={`t-icon ${cfg.className}`}>{cfg.icon}</div>
      <div className="t-text">
        <strong>{check.label}</strong>{' '}
        <em>{check.detail}</em>
      </div>
    </div>
  )
}

function StrandedTokenRow({ token }: { token: StrandedToken }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 14px', borderRadius: '7px',
      background: 'var(--card-inner)', border: '1px solid var(--border)',
      marginBottom: '6px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '6px',
          background: 'var(--eth-soft)', border: '1px solid var(--eth-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontSize: '0.55rem',
          fontWeight: 600, color: 'var(--eth)', flexShrink: 0,
        }}>
          {token.tokenSymbol.slice(0, 4)}
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
            {token.tokenName}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-2)', marginTop: '1px' }}>
            {formatBalance(token.balanceFormatted, token.tokenSymbol)}
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
          {formatUsd(token.valueUsd)}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-3)', marginTop: '1px' }}>
          ${token.priceUsd.toFixed(token.priceUsd < 0.01 ? 6 : 2)} per token
        </div>
      </div>
    </div>
  )
}

export default function ScanResultCard({ result, isFounder }: ScanResultCardProps) {
  const [copied, setCopied] = useState(false)

  const statusCfg    = STATUS_CONFIG[result.triageStatus]
  const explorerLink = explorerUrl(result.contractAddress, result.chain)
  const chainLabel   = result.chain === 'eth' ? 'Ethereum' : 'Base'
  const symbol       = result.tokenSymbol || '???'
  const name         = result.tokenName   || 'Unknown Contract'
  const hasStranded  = result.strandedTokens && result.strandedTokens.length > 0
  const totalUsd     = result.totalStrandedUsd ?? 0
  const feeUsd       = result.finderFeeUsd     ?? 0

  // Get rescue function name from checks for guide content
  const rescueCheck      = result.checks.find(c => c.label.includes('()') && c.status === 'pass')
  const rescueFunctionName = rescueCheck?.label.replace('()', '').replace(' found in ABI', '').replace(' found in verified ABI', '').trim()

  // Get primary stranded token address for registration
  const primaryTokenAddress = result.strandedTokens?.[0]?.tokenAddress
    || '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'

  const handleCopyOutreach = () => {
    const template = generateOutreachTemplate(result)
    navigator.clipboard.writeText(template)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="r-card">
      {/* Header */}
      <div className="r-head">
        <div className="r-token">
          <div className="r-avatar">{symbol.slice(0, 5)}</div>
          <div>
            <div className="r-name">{name}</div>
            <div className="r-addr">
              {truncateAddress(result.contractAddress)}
              <span className="chain-pill">{chainLabel}</span>
            </div>
          </div>
        </div>
        <div className={`s-badge ${statusCfg.className}`}>{statusCfg.label}</div>
      </div>

      {/* Metrics */}
      <div className="r-metrics">
        <div className="r-metric">
          <div className="r-m-label">Stranded Value</div>
          {hasStranded ? (
            <>
              <div className="r-m-val">{formatUsd(totalUsd)}</div>
              <div className="r-m-sub">{result.strandedTokens!.length} token{result.strandedTokens!.length > 1 ? 's' : ''} found</div>
            </>
          ) : (
            <>
              <div className="r-m-val muted">$0</div>
              <div className="r-m-sub">No stranded tokens found</div>
            </>
          )}
        </div>
        <div className="r-metric">
          <div className="r-m-label">Your Finder&apos;s Fee</div>
          {hasStranded ? (
            <>
              <div className="r-m-val accent">{formatUsd(feeUsd)}</div>
              <div className="r-m-sub">7% on successful recovery</div>
            </>
          ) : (
            <>
              <div className="r-m-val muted">—</div>
              <div className="r-m-sub">No value to recover</div>
            </>
          )}
        </div>
        <div className="r-metric">
          <div className="r-m-label">Deployed By</div>
          <div className="r-m-val mono">
            {result.deployerAddress ? truncateAddress(result.deployerAddress) : '—'}
          </div>
          <div className="r-m-sub">Contract creator</div>
        </div>
      </div>

      {/* Stranded tokens breakdown */}
      {hasStranded && (
        <div style={{ padding: '16px 26px', borderBottom: '1px solid var(--border)' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--text-2)', marginBottom: '10px',
          }}>
            Stranded Tokens
          </div>
          {result.strandedTokens!.map((token, i) => (
            <StrandedTokenRow key={i} token={token} />
          ))}
        </div>
      )}

      {/* Founder note */}
      {isFounder && result.triageStatus !== 'unrecoverable' && (
        <div className="founder-note">
          <span>👑</span> Founder wallet — Recovery Guide unlocked automatically.
        </div>
      )}

      {/* Triage checks */}
      <div className="r-triage">
        {result.checks.map((check, i) => (
          <TriageRow key={i} check={check} />
        ))}
      </div>

      {/* Actions */}
      <div className="r-actions">
        {result.triageStatus !== 'unrecoverable' ? (
          <>
            <RegisterFindButton
              contractAddress={result.contractAddress}
              tokenAddress={primaryTokenAddress}
              chain={result.chain}
              triageStatus={result.triageStatus}
            />
            <button
              className="btn-out"
              onClick={handleCopyOutreach}
            >
              {copied ? 'Copied! ✓' : 'Copy Outreach'}
            </button>
            <a
              href={explorerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-out"
              style={{ textDecoration: 'none', display: 'inline-block' }}
            >
              {chainLabel === 'Ethereum' ? 'Etherscan' : 'Basescan'} ↗
            </a>
            <RecoveryGuideButton
              triageStatus={result.triageStatus}
              contractAddress={result.contractAddress}
              isFounder={isFounder}
              rescueFunctionName={rescueFunctionName}
            />
          </>
        ) : (
          <>
            <button className="btn-cant" disabled>Cannot Register</button>
            <button
              className="btn-out"
              style={{ opacity: 0.35, cursor: 'not-allowed' }}
              disabled
            >
              Copy Outreach
            </button>
            <a
              href={explorerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-out"
              style={{ textDecoration: 'none', display: 'inline-block' }}
            >
              {chainLabel === 'Ethereum' ? 'Etherscan' : 'Basescan'} ↗
            </a>
            <span className="dead-note">Documented on public leaderboard</span>
          </>
        )}
      </div>
    </div>
  )
}