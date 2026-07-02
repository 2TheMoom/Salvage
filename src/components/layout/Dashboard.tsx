'use client'

import { useState, useCallback, useEffect } from 'react'
import { useAccount } from 'wagmi'
import SonarLogo from '@/components/ui/SonarLogo'
import ScanResultCard from '@/components/ui/ScanResultCard'
import VictimResultCard from '@/components/ui/VictimResultCard'
import ConnectButton from '@/components/ui/ConnectButton'
import { ScanResult, Chain, ScanApiResponse, VictimScanResult, VictimScanApiResponse } from '@/types'
import { isValidAddress } from '@/lib/utils'

const FOUNDER_ADDRESS = (
  process.env.NEXT_PUBLIC_FOUNDER_ADDRESS || ''
).toLowerCase()

type LeaderboardEntry = {
  id: string
  contract_address: string
  token_symbol: string
  token_name: string
  chain: string
  stranded_value_usd: number
  triage_status: string
  verified: boolean
}

type ScanState = 'idle' | 'loading' | 'success' | 'error'

interface DashboardProps {
  onGoLanding: () => void
  connectedWallet: string | null
}

function formatUsdShort(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}

export default function Dashboard({ onGoLanding }: DashboardProps) {
  const { address, isConnected }      = useAccount()
  const [mode, setMode]               = useState<'contract' | 'victim'>('contract')
  const [inputAddr, setInputAddr]     = useState('')
  const [chain, setChain]             = useState<Chain>('eth')
  const [scanState, setScanState]     = useState<ScanState>('idle')
  const [result, setResult]           = useState<ScanResult | null>(null)
  const [victimResult, setVictimResult] = useState<VictimScanResult | null>(null)
  const [errorMsg, setErrorMsg]       = useState<string | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [lbChain, setLbChain]         = useState<'eth' | 'base'>('eth')
  const [lbLoading, setLbLoading]     = useState(false)

  const isFounder = address
    ? address.toLowerCase() === FOUNDER_ADDRESS
    : false

  const connectedWallet = isConnected && address ? address : null

  // Fetch leaderboard on mount and chain change
  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLbLoading(true)
      try {
        const res  = await fetch(`/api/leaderboard?chain=${lbChain}`)
        const data = await res.json()
        if (data.success) setLeaderboard(data.data || [])
      } catch {
        setLeaderboard([])
      } finally {
        setLbLoading(false)
      }
    }
    fetchLeaderboard()
  }, [lbChain])

  const handleScan = useCallback(async () => {
    if (!isValidAddress(inputAddr)) {
      setErrorMsg(mode === 'victim'
        ? 'Enter a valid 0x wallet address.'
        : 'Enter a valid 0x contract address.')
      return
    }
    setScanState('loading')
    setResult(null)
    setVictimResult(null)
    setErrorMsg(null)

    try {
      const endpoint = mode === 'victim' ? '/api/victim-scan' : '/api/scan'
      const res  = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ address: inputAddr, chain }),
      })

      if (mode === 'victim') {
        const data: VictimScanApiResponse = await res.json()
        if (data.success && data.result) {
          setVictimResult(data.result)
          setScanState('success')
        } else {
          setErrorMsg(data.error || 'Scan failed.')
          setScanState('error')
        }
        return
      }

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
  }, [inputAddr, chain, mode])

  const switchMode = (m: 'contract' | 'victim') => {
    if (m === mode) return
    setMode(m)
    setScanState('idle')
    setResult(null)
    setVictimResult(null)
    setErrorMsg(null)
  }

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
          <ConnectButton variant="dashboard" />
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
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: '10px',
            }}>
              <div className="scan-zone-label" style={{ marginBottom: 0 }}>
                {mode === 'contract' ? 'Contract Scanner' : 'Lost Token Scanner'}
              </div>
              <div className="chain-toggle">
                <button
                  className={`c-tab ${mode === 'contract' ? 'on' : ''}`}
                  onClick={() => switchMode('contract')}
                >Scan Contract</button>
                <button
                  className={`c-tab ${mode === 'victim' ? 'on' : ''}`}
                  onClick={() => switchMode('victim')}
                >Did I Lose Tokens?</button>
              </div>
            </div>
            <div className="scan-bar">
              <div className="chain-toggle">
                <button
                  className={`c-tab ${chain === 'eth' ? 'on' : ''}`}
                  onClick={() => setChain('eth')}
                >ETH</button>
                <button
                  className={`c-tab ${chain === 'base' ? 'on' : ''}`}
                  onClick={() => setChain('base')}
                >BASE</button>
              </div>
              <input
                className="scan-input"
                placeholder={mode === 'victim'
                  ? 'Paste your wallet address…'
                  : 'Paste any ERC-20 contract address…'}
                value={inputAddr}
                onChange={e => setInputAddr(e.target.value)}
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
              <div className="scan-empty-title">
                {mode === 'victim' ? 'Paste your wallet address to begin' : 'Paste a contract address to begin'}
              </div>
              <div className="scan-empty-sub">
                {mode === 'victim'
                  ? 'Salvage will scan your transfer history for tokens mistakenly sent to contract addresses — like the classic mistake of sending a token to its own contract — and check if they can be recovered.'
                  : 'Enter any ERC-20 token contract on Ethereum or Base. Salvage will check for stranded tokens, rescue functions, and recovery paths.'}
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
              <div className="scan-empty-title">
                {mode === 'victim' ? 'Scanning your history…' : 'Scanning contract…'}
              </div>
              <div className="scan-empty-sub">
                {mode === 'victim'
                  ? 'Reading transfers · Verifying mistakes on-chain · Triaging recovery paths'
                  : 'Checking bytecode · Fetching ABI · Running triage'}
              </div>
            </div>
          )}

          {scanState === 'success' && mode === 'victim' && victimResult && (
            <>
              <div className="col-label">
                Lost Token Report — {victimResult.wallet.slice(0, 6)}…{victimResult.wallet.slice(-4)}
              </div>
              <VictimResultCard result={victimResult} />
            </>
          )}

          {scanState === 'success' && mode === 'contract' && result && (
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
                <div className="s-sub">
                  {lbLoading ? 'Loading…' : 'Click row to scan'}
                </div>
              </div>
              <div className="s-tabs">
                <button
                  className={`s-tab ${lbChain === 'eth' ? 'on' : ''}`}
                  onClick={() => setLbChain('eth')}
                >ETH</button>
                <button
                  className={`s-tab ${lbChain === 'base' ? 'on' : ''}`}
                  onClick={() => setLbChain('base')}
                >Base</button>
              </div>
            </div>

            {lbLoading ? (
              <div style={{
                padding: '32px 22px', textAlign: 'center',
                fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                color: 'var(--text-3)',
              }}>
                Loading…
              </div>
            ) : leaderboard.length === 0 ? (
              <div style={{
                padding: '32px 22px', textAlign: 'center',
                fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                color: 'var(--text-3)', lineHeight: 1.6,
              }}>
                No entries yet.<br />Scan contracts to populate.
              </div>
            ) : (
              leaderboard.map((row, i) => (
                <div
                  key={row.id}
                  className="lb-row"
                  onClick={() => setInputAddr(row.contract_address)}
                  title="Click to scan this contract"
                >
                  <div className="lb-rank">{i + 1}</div>
                  <div className="lb-info">
                    <div className="lb-addr">
                      {row.contract_address.slice(0, 6)}…{row.contract_address.slice(-4)}
                    </div>
                    <div className="lb-desc">{row.token_name}</div>
                  </div>
                  <div className="lb-right">
                    <div className="lb-usd">{formatUsdShort(row.stranded_value_usd)}</div>
                    <div className="lb-dot-row">
                      <span className={`s-dot ${
                        row.triage_status === 'recoverable'   ? 'dot-g' :
                        row.triage_status === 'needs_action'  ? 'dot-a' : 'dot-r'
                      }`} />
                      <span className="lb-dot-label">
                        {row.triage_status === 'needs_action' ? 'needs action' : row.triage_status}
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