'use client'

import { ScanResult, TriageCheck } from '@/types'
import { truncateAddress, explorerUrl } from '@/lib/utils'

interface ScanResultCardProps {
  result: ScanResult
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

export default function ScanResultCard({ result, isFounder }: ScanResultCardProps) {
  const statusCfg  = STATUS_CONFIG[result.triageStatus]
  const explorerLink = explorerUrl(result.contractAddress, result.chain)
  const chainLabel = result.chain === 'eth' ? 'Ethereum' : 'Base'
  const symbol     = result.tokenSymbol || '???'
  const name       = result.tokenName   || 'Unknown Contract'

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
          {/* M2: real values will populate here */}
          <div className="r-m-val" style={{ fontSize: '1rem', color: 'var(--text-2)' }}>
            Scanning in M2
          </div>
          <div className="r-m-sub">Token sweep in next milestone</div>
        </div>
        <div className="r-metric">
          <div className="r-m-label">Your Finder's Fee</div>
          <div className="r-m-val accent" style={{ fontSize: '1rem' }}>
            7% on recovery
          </div>
          <div className="r-m-sub">After successful claim</div>
        </div>
        <div className="r-metric">
          <div className="r-m-label">Deployed By</div>
          <div className="r-m-val mono">
            {result.deployerAddress
              ? truncateAddress(result.deployerAddress)
              : '—'}
          </div>
          <div className="r-m-sub">Contract creator</div>
        </div>
      </div>

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
            <button className="btn-reg">Register This Find</button>
            <button className="btn-out">Copy Outreach</button>
            <a
              href={explorerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-out"
              style={{ textDecoration: 'none', display: 'inline-block' }}
            >
              {chainLabel === 'Ethereum' ? 'Etherscan' : 'Basescan'} ↗
            </a>
            {isFounder ? (
              <button className="btn-guide-founder" style={{ marginLeft: 'auto' }}>
                View Recovery Guide (Founder)
              </button>
            ) : (
              <button className="btn-guide" style={{ marginLeft: 'auto' }}>
                Unlock Recovery Guide — {result.triageStatus === 'recoverable' ? '$149' : '$99'}
              </button>
            )}
          </>
        ) : (
          <>
            <button className="btn-cant" disabled>Cannot Register</button>
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