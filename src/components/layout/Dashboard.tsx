'use client'

import { useState, useCallback } from 'react'
import SonarLogo from '@/components/ui/SonarLogo'
import ScanResultCard from '@/components/ui/ScanResultCard'
import { ScanResult, Chain, ScanApiResponse } from '@/types'
import { isValidAddress } from '@/lib/utils'

const FOUNDER_ADDRESS = (
  process.env.NEXT_PUBLIC_FOUNDER_ADDRESS || ''
).toLowerCase()

// Simulated leaderboard data — M3 will pull this from real indexer
const LEADERBOARD: { addr: string; desc: string; amount: string; status: string }[] = []

type ScanState = 'idle' | 'loading' | 'success' | 'error'

interface DashboardProps {
  onGoLanding: () => void
  connectedWallet: string | null
}

export default function Dashboard({ onGoLanding, connectedWallet }: DashboardProps) {
  const [address, setAddress]   = useState('')
  const [chain, setChain]       = useState<Chain>('eth')
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [result, setResult]     = useState<ScanResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const isFounder = connectedWallet
    ? connectedWallet.toLowerCase() === FOUNDER_ADDRESS
    : false

  const handleScan = useCallback(async () => {
    if (!isValidAddress(address)) {
      setErrorMsg('Enter a valid 0x contract address.')
      return
    }
    setScanState('loading')
    setResult(null)
    setErrorMsg(null)

    try {
      const res  = await fetch('/api/scan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ address, chain }),
      })
      const data: ScanApiResponse = await res.json()

      if (data.success && data.result) {
        setResult(data.result)
        setScanState('success')
      } else {
        setErrorMsg(data.error || 'Scan failed.')
        setScanState('error')
      }
    } catch {
      setErrorMsg('Network error. Please try again.')
      setScanState('error')
    }
  }, [address, chain])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleScan()
  }

  return (
    <div id="dashboard">
      {/* Nav */}
      <nav className="d-nav">
        <div className="d-logo" onClick={onGoLanding} style={{ cursor: 'pointer' }}>
          <SonarLogo size={28} variant="white" showWordmark wordmarkSize="1.2rem" />
        </div>
        <ul className="d-nav-links">
          <li><a href="#" className="on">Scanner</a></li>
          <li><a href="#">Leaderboard</a></li>
          <li><a href="#">My Finds</a></li>
          <li><a href="#">Recover</a></li>
          <li><a href="#">Claim Fee</a></li>
        </ul>
        <div className="d-nav-right">
          {connectedWallet ? (
            <div className={`wallet-chip ${isFounder ? 'founder' : ''}`}>
              <span className="w-dot" />
              <span>
                {connectedWallet.slice(0, 6)}…{connectedWallet.slice(-4)}
              </span>
              {isFounder && <span style={{ fontSize: '0.7rem', marginLeft: 2 }}>👑</span>}
            </div>
          ) : (
            <button className="btn-connect-d">Connect Wallet</button>
          )}
        </div>
      </nav>

      {/* Stats bar */}
      <div className="d-stats">
        <div className="d-stat">
          <div className="d-stat-label">Total Stranded · ETH+Base</div>
          <div className="d-stat-num">—</div>
          <div className="d-stat-sub">Indexer live in M3</div>
        </div>
        <div className="d-stat">
          <div className="d-stat-label">Recoverable Now</div>
          <div className="d-stat-num accent">—</div>
          <div className="d-stat-sub">Indexer live in M3</div>
        </div>
        <div className="d-stat">
          <div className="d-stat-label">All-Time Recovered</div>
          <div className="d-stat-num">$0</div>
          <div className="d-stat-sub">No recoveries yet</div>
        </div>
        <div className="d-stat">
          <div className="d-stat-label">Recovered This Month</div>
          <div className="d-stat-num">$0</div>
          <div className="d-stat-sub">No recoveries yet</div>
        </div>
        <div className="d-stat">
          <div className="d-stat-label">Protocol Fees Earned</div>
          <div className="d-stat-num accent">$0</div>
          <div className="d-stat-sub">3% of all recoveries</div>
        </div>
      </div>

      {/* Main layout */}
      <div className="d-main">
        {/* Left column */}
        <div>
          {/* Scan zone */}
          <div className="scan-zone">
            <div className="scan-zone-label">Contract Scanner</div>
            <div className="scan-bar">
              <div className="chain-toggle">
                <button
                  className={`c-tab ${chain === 'eth' ? 'on' : ''}`}
                  onClick={() => setChain('eth')}
                >
                  ETH
                </button>
                <button
                  className={`c-tab ${chain === 'base' ? 'on' : ''}`}
                  onClick={() => setChain('base')}
                >
                  BASE
                </button>
              </div>
              <input
                className="scan-input"
                placeholder="Paste any ERC-20 contract address…"
                value={address}
                onChange={e => setAddress(e.target.value)}
                onKeyDown={handleKeyDown}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                className="btn-scan"
                onClick={handleScan}
                disabled={scanState === 'loading'}
              >
                {scanState === 'loading' ? 'Scanning…' : 'Scan'}
              </button>
            </div>
            {errorMsg && (
              <div style={{
                marginTop: '10px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                color: 'var(--crimson)',
              }}>
                ✗ {errorMsg}
              </div>
            )}
          </div>

          {/* Results */}
          {scanState === 'idle' && (
            <div className="scan-empty">
              <div className="scan-empty-icon">
                <svg width="40" height="40" viewBox="0 0 52 52" fill="none">
                  <path d="M 8 44 A 26 26 0 0 1 44 8"  stroke="var(--eth)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.25"/>
                  <path d="M 13 44 A 21 21 0 0 1 44 13" stroke="var(--eth)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.50"/>
                  <path d="M 19 44 A 15 15 0 0 1 44 19" stroke="var(--eth)" strokeWidth="2.8" strokeLinecap="round" fill="none" opacity="0.80"/>
                  <circle cx="44" cy="44" r="4.5" fill="var(--eth)"/>
                </svg>
              </div>
              <div className="scan-empty-title">Paste a contract address to begin</div>
              <div className="scan-empty-sub">
                Enter any ERC-20 token contract on Ethereum or Base. Salvage will check for
                stranded tokens, rescue functions, and recovery paths.
              </div>
            </div>
          )}

          {scanState === 'loading' && (
            <div className="scan-empty">
              <div className="scan-empty-icon scanning">
                <svg width="40" height="40" viewBox="0 0 52 52" fill="none">
                  <path d="M 8 44 A 26 26 0 0 1 44 8"  stroke="var(--eth)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.25"/>
                  <path d="M 13 44 A 21 21 0 0 1 44 13" stroke="var(--eth)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.50"/>
                  <path d="M 19 44 A 15 15 0 0 1 44 19" stroke="var(--eth)" strokeWidth="2.8" strokeLinecap="round" fill="none" opacity="0.80"/>
                  <circle cx="44" cy="44" r="4.5" fill="var(--eth)"/>
                </svg>
              </div>
              <div className="scan-empty-title">Scanning contract…</div>
              <div className="scan-empty-sub">
                Checking bytecode · Fetching ABI · Running triage
              </div>
            </div>
          )}

          {scanState === 'success' && result && (
            <>
              <div className="col-label">
                Scan Result — {result.contractAddress.slice(0, 6)}…{result.contractAddress.slice(-4)}
              </div>
              <ScanResultCard result={result} isFounder={isFounder} />
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="d-sidebar">
          {/* Leaderboard */}
          <div className="s-card">
            <div className="s-head">
              <div>
                <div className="s-title">Stranded Leaderboard</div>
                <div className="s-sub">Updated every 6 hrs · click to scan</div>
              </div>
              <div className="s-tabs">
                <button className="s-tab on">ETH</button>
                <button className="s-tab">Base</button>
              </div>
            </div>
            {LEADERBOARD.length === 0 ? (
              <div style={{
                padding: '32px 22px', textAlign: 'center',
                fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                color: 'var(--text-3)', lineHeight: 1.6,
              }}>
                No entries yet.<br />Indexer launches in M3.
              </div>
            ) : (
              LEADERBOARD.map((row, i) => (
                <div
                  key={i}
                  className="lb-row"
                  onClick={() => setAddress(row.addr.replace('…', '0000000'))}
                  title="Click to scan this contract"
                >
                  <div className="lb-rank">{i + 1}</div>
                  <div className="lb-info">
                    <div className="lb-addr">{row.addr}</div>
                    <div className="lb-desc">{row.desc}</div>
                  </div>
                  <div className="lb-right">
                    <div className="lb-usd">{row.amount}</div>
                    <div className="lb-dot-row">
                      <span className={`s-dot dot-${row.status === 'recoverable' ? 'g' : row.status === 'needs_action' ? 'a' : 'r'}`} />
                      <span className="lb-dot-label">
                        {row.status === 'needs_action' ? 'needs action' : row.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Earnings */}
          <div className="s-card">
            <div className="s-head">
              <div>
                <div className="s-title">Your Earnings</div>
                <div className="s-sub">All three revenue streams</div>
              </div>
            </div>
            <div className="e-body">
              {connectedWallet ? (
                <>
                  <div className={`e-banner ${isFounder ? 'founder' : 'regular'}`}>
                    <div className={`e-bdot ${isFounder ? 'eth' : 'grn'}`} />
                    <div className={`e-btext ${isFounder ? 'eth' : 'grn'}`}>
                      {isFounder ? '👑 Founder wallet' : 'Wallet'} · {connectedWallet.slice(0, 6)}…{connectedWallet.slice(-4)}
                    </div>
                  </div>
                  <div className="e-row"><span className="e-key">Protocol cut (3%)</span><span className="e-val">$0</span></div>
                  <div className="e-row"><span className="e-key">Your own finds (7%)</span><span className="e-val">$0</span></div>
                  <div className="e-row"><span className="e-key">Recovery guide sales</span><span className="e-val">$0</span></div>
                  <div className="e-div" />
                  <div className="e-total">
                    <span className="e-total-key">Total earned</span>
                    <span className="e-total-val">$0</span>
                  </div>
                </>
              ) : (
                <div style={{
                  textAlign: 'center', padding: '24px 0',
                  fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
                  color: 'var(--text-3)',
                }}>
                  Connect wallet to see your earnings
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="d-footer">
        <div className="d-footer-l">
          Salvage v0.1 · Ethereum + Base · Alchemy + Etherscan API V2
        </div>
        <div className="d-footer-r">
          <a href="#">Docs</a>
          <a href="#">Fee Contract</a>
          <a href="https://x.com/salvagexyz" target="_blank" rel="noopener noreferrer">@salvagexyz</a>
          <a href="https://x.com/Olumi441" target="_blank" rel="noopener noreferrer" className="credit">
            Built by Abu Olumi ↗
          </a>
        </div>
      </footer>
    </div>
  )
}