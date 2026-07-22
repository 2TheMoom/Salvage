'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import SonarLogo from '@/components/ui/SonarLogo'
import ScanResultCard from '@/components/ui/ScanResultCard'
import VictimResultCard from '@/components/ui/VictimResultCard'
import ConnectButton from '@/components/ui/ConnectButton'
import ChainSwitcher from '@/components/ui/ChainSwitcher'
import OwnerStatusPanel from '@/components/ui/OwnerStatusPanel'
import PageNav from '@/components/ui/PageNav'
import { ScanResult, Chain, ScanApiResponse, VictimScanResult, VictimScanApiResponse } from '@/types'
import { isValidAddress, truncateAddress } from '@/lib/utils'

type ActivityItem = {
  type: 'find' | 'claim_registered' | 'claim_settled'
  chain: string
  tokenSymbol: string | null
  valueUsd: number | null
  address: string
  txHash: string | null
  timestamp: string
}

const ACTIVITY_LABEL: Record<ActivityItem['type'], string> = {
  find: 'Find registered',
  claim_registered: 'Claim registered',
  claim_settled: 'Settled',
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

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
  initialScan?: { chain: Chain; address: string } | null
  scrollTarget?: string | null
  onScrollHandled?: () => void
}

function formatUsdShort(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(1)}K`
  if (value > 0 && value < 1) return `$${value.toFixed(2)}`
  return `$${value.toFixed(0)}`
}

export default function Dashboard({ onGoLanding, initialScan, scrollTarget, onScrollHandled }: DashboardProps) {
  const { address, isConnected }      = useAccount()
  const [mode, setMode]               = useState<'contract' | 'victim'>('contract')
  const [inputAddr, setInputAddr]     = useState('')
  const [chain, setChain]             = useState<Chain>('eth')
  const [scanState, setScanState]     = useState<ScanState>('idle')
  const [result, setResult]           = useState<ScanResult | null>(null)
  const [victimResult, setVictimResult] = useState<VictimScanResult | null>(null)
  const [errorMsg, setErrorMsg]       = useState<string | null>(null)
  const [leaderboard, setLeaderboard]     = useState<LeaderboardEntry[]>([])
  const [lbChain, setLbChain]             = useState<'eth' | 'base'>('eth')
  const [lbLoading, setLbLoading]         = useState(false)
  const [lbPage, setLbPage]               = useState(1)
  const [lbTotalPages, setLbTotalPages]   = useState(1)
  // Leaderboard and Activity share the exact same row layout and both browse
  // the protocol's public state (ranked vs. chronological) — one tabbed card
  // instead of two stacked panels with duplicate chrome.
  const [sidebarTab, setSidebarTab]   = useState<'leaderboard' | 'activity'>('leaderboard')
  const [stats, setStats]             = useState<{
    totalStrandedUsd: number
    strandedEthUsd: number
    strandedBaseUsd: number
    recoverableUsd: number
    recoverableCount: number
    contractsIndexed: number
    recoveredAllTime: number
    recoveredThisMonth: number
    protocolFeesUsd: number
    recoveredCount: number
  } | null>(null)

  // Fetch live stats on mount
  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(d => { if (d.success) setStats(d.stats) })
      .catch(() => {})
  }, [])

  const isFounder = address
    ? address.toLowerCase() === FOUNDER_ADDRESS
    : false

  const connectedWallet = isConnected && address ? address : null

  // A regular user's own recovered funds
  const [userRecovered, setUserRecovered] = useState<{ total: number; count: number }>({ total: 0, count: 0 })
  useEffect(() => {
    if (!connectedWallet) { setUserRecovered({ total: 0, count: 0 }); return }
    fetch(`/api/claims?victim=${connectedWallet}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && Array.isArray(d.claims)) {
          const settled = d.claims.filter((c: { status: string }) => c.status === 'settled')
          const total = settled.reduce((s: number, c: { value_usd: number | null }) => s + (Number(c.value_usd) || 0), 0)
          setUserRecovered({ total, count: settled.length })
        }
      })
      .catch(() => {})
  }, [connectedWallet])

  // True paged navigation, not an ever-growing "load more" list — a
  // cumulative list still eventually makes the sidebar arbitrarily tall as
  // real data piles up; a fixed page size keeps its height capped no matter
  // how much the leaderboard or activity feed grows.
  useEffect(() => {
    setLbPage(1)
  }, [lbChain])

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLbLoading(true)
      try {
        const res  = await fetch(`/api/leaderboard?chain=${lbChain}&page=${lbPage}`)
        const data = await res.json()
        if (data.success) {
          setLeaderboard(data.data || [])
          setLbTotalPages(data.totalPages || 1)
        }
      } catch {
        setLeaderboard([])
      } finally {
        setLbLoading(false)
      }
    }
    fetchLeaderboard()
  }, [lbChain, lbPage])

  // Recent activity — a chronological feed rather than a ranked leaderboard,
  // since real volume (finds/claims) is still low enough that a ranking
  // would show one entry and read as dead rather than new.
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityPage, setActivityPage] = useState(1)
  const [activityTotalPages, setActivityTotalPages] = useState(1)
  useEffect(() => {
    setActivityLoading(true)
    fetch(`/api/activity?page=${activityPage}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setActivity(d.items || [])
          setActivityTotalPages(d.totalPages || 1)
        }
      })
      .catch(() => {})
      .finally(() => setActivityLoading(false))
  }, [activityPage])

  const runScan = useCallback(async (addr: string, scanChain: Chain, scanMode: 'contract' | 'victim') => {
    if (!isValidAddress(addr)) {
      setErrorMsg(scanMode === 'victim'
        ? 'Enter a valid 0x wallet address.'
        : 'Enter a valid 0x contract address.')
      return
    }
    setScanState('loading')
    setResult(null)
    setVictimResult(null)
    setErrorMsg(null)

    try {
      const endpoint = scanMode === 'victim' ? '/api/victim-scan' : '/api/scan'
      const res  = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ address: addr, chain: scanChain }),
      })

      if (scanMode === 'victim') {
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
  }, [])

  const handleScan = useCallback(() => {
    runScan(inputAddr, chain, mode)
  }, [runScan, inputAddr, chain, mode])

  // Outreach deep link (`?scan=chain:0xaddress`) — land the contract owner
  // straight on their own scan result instead of a blank homepage.
  useEffect(() => {
    if (!initialScan) return
    setMode('contract')
    setChain(initialScan.chain)
    setInputAddr(initialScan.address)
    runScan(initialScan.address, initialScan.chain, 'contract')
    // Runs once for the deep link this page loaded with — not on every
    // runScan identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScan])

  // "View Leaderboard" from the landing page — scroll to the section that's
  // already on this page instead of leaving the click going nowhere.
  useEffect(() => {
    if (!scrollTarget) return
    document.getElementById(scrollTarget)?.scrollIntoView({ behavior: 'smooth' })
    onScrollHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollTarget])

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
          <li><a href="#" className="on" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Scanner</a></li>
          <li><a href="#leaderboard" onClick={(e) => { e.preventDefault(); setSidebarTab('leaderboard'); document.getElementById('leaderboard')?.scrollIntoView({ behavior: 'smooth' }) }}>Leaderboard</a></li>
          <li><a href="/docs">Docs</a></li>
        </ul>
        <div className="d-nav-right" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ChainSwitcher />
          <ConnectButton variant="dashboard" />
        </div>
      </nav>

      {/* Stats bar */}
      <div className="d-stats">
        <div className="d-stat">
          <div className="d-stat-label">Total Stranded · ETH+Base</div>
          <div className="d-stat-num">{stats ? formatUsdShort(stats.totalStrandedUsd) : '—'}</div>
          <div className="d-stat-sub">
            {stats
              ? `ETH ${formatUsdShort(stats.strandedEthUsd)} · Base ${formatUsdShort(stats.strandedBaseUsd)} · ${stats.contractsIndexed} contracts`
              : 'Loading…'}
          </div>
        </div>
        <div className="d-stat">
          <div className="d-stat-label">Recoverable Now</div>
          <div className="d-stat-num accent">{stats ? formatUsdShort(stats.recoverableUsd) : '—'}</div>
          <div className="d-stat-sub">
            {stats ? `${stats.recoverableCount} contract${stats.recoverableCount === 1 ? '' : 's'} with a rescue path` : 'Loading…'}
          </div>
        </div>
        <div className="d-stat">
          <div className="d-stat-label">All-Time Recovered</div>
          <div className="d-stat-num">{stats ? formatUsdShort(stats.recoveredAllTime) : '$0'}</div>
          <div className="d-stat-sub">
            {stats && stats.recoveredCount > 0
              ? `${stats.recoveredCount} recover${stats.recoveredCount === 1 ? 'y' : 'ies'} settled`
              : 'No recoveries yet'}
          </div>
        </div>
        <div className="d-stat">
          <div className="d-stat-label">Recovered This Month</div>
          <div className="d-stat-num">{stats ? formatUsdShort(stats.recoveredThisMonth) : '$0'}</div>
          <div className="d-stat-sub">
            {stats && stats.recoveredThisMonth > 0 ? 'Settled on-chain' : 'No recoveries yet'}
          </div>
        </div>
        <div className="d-stat">
          <div className="d-stat-label">Protocol Fees Earned</div>
          <div className="d-stat-num accent">{stats ? formatUsdShort(stats.protocolFeesUsd) : '$0'}</div>
          <div className="d-stat-sub">3–5% of all recoveries</div>
        </div>
      </div>

      {connectedWallet && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px 40px 0' }}>
          <OwnerStatusPanel
            wallet={connectedWallet}
            onViewContract={(addr, viewChain) => {
              setMode('contract')
              setChain(viewChain)
              setInputAddr(addr)
              runScan(addr, viewChain, 'contract')
            }}
          />
        </div>
      )}

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

          {scanState === 'idle' && (
            <div className="how-grid" style={{ marginTop: '20px' }}>
              <div className="how-card">
                <div className="how-step">Step 01 · Scan</div>
                <div className="how-title">Paste an address</div>
                <div className="how-body">
                  A contract or a wallet — Salvage checks for stranded tokens, rescue functions, and a real recovery path, on Ethereum or Base.
                </div>
              </div>
              <div className="how-card">
                <div className="how-step">Step 02 · Register</div>
                <div className="how-title">Lock in your claim</div>
                <div className="how-body">
                  Sign an EIP-712 claim (owner/victim) or a message (finder) — free, no gas, and Salvage never takes custody of anything.
                </div>
              </div>
              <div className="how-card">
                <div className="how-step">Step 03 · Settle</div>
                <div className="how-title">Collect once funded</div>
                <div className="how-body">
                  settle() is on-chain and permissionless — funds split automatically by the fee schedule the moment the deposit address is funded.
                </div>
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
              <ScanResultCard result={result} />
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="d-sidebar">

          {/* Leaderboard / Activity — one tabbed card; see note above */}
          <div className="s-card" id="leaderboard">
            <div className="s-head">
              <div>
                <div className="s-title">
                  {sidebarTab === 'leaderboard' ? 'Stranded Leaderboard' : 'Recent Activity'}
                </div>
                <div className="s-sub">
                  {sidebarTab === 'leaderboard'
                    ? (lbLoading ? 'Loading…' : 'Click row to scan')
                    : (activityLoading ? 'Loading…' : 'Finds and claims, live')}
                </div>
              </div>
              <div className="s-tabs">
                <button
                  className={`s-tab ${sidebarTab === 'leaderboard' ? 'on' : ''}`}
                  onClick={() => setSidebarTab('leaderboard')}
                >Leaderboard</button>
                <button
                  className={`s-tab ${sidebarTab === 'activity' ? 'on' : ''}`}
                  onClick={() => setSidebarTab('activity')}
                >Activity</button>
              </div>
            </div>

            {sidebarTab === 'leaderboard' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 22px 0' }}>
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
            )}

            {sidebarTab === 'leaderboard' ? (
            lbLoading ? (
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
              <>
                {leaderboard.map((row, i) => (
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
              ))}
                <PageNav page={lbPage} totalPages={lbTotalPages} onChange={setLbPage} disabled={lbLoading} />
              </>
            )
            ) : (
            activityLoading ? (
              <div style={{
                padding: '32px 22px', textAlign: 'center',
                fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                color: 'var(--text-3)',
              }}>
                Loading…
              </div>
            ) : activity.length === 0 ? (
              <div style={{
                padding: '32px 22px', textAlign: 'center',
                fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                color: 'var(--text-3)', lineHeight: 1.6,
              }}>
                No activity yet.<br />Be the first to register a find or claim.
              </div>
            ) : (
              <>
                {activity.map((item, i) => {
                  const explorer = item.chain === 'eth' ? 'etherscan.io' : 'basescan.org'
                  return (
                    <div key={i} className="lb-row" style={{ cursor: item.txHash ? 'pointer' : 'default' }}
                      onClick={() => { if (item.txHash) window.open(`https://${explorer}/tx/${item.txHash}`, '_blank') }}
                      title={item.txHash ? 'View transaction' : undefined}
                    >
                      <div className="lb-rank">{i + 1}</div>
                      <div className="lb-rank" style={{
                        background: item.type === 'claim_settled' ? 'var(--green-soft)' : 'var(--eth-soft)',
                        color: item.type === 'claim_settled' ? 'var(--green)' : 'var(--eth)',
                      }}>
                        {item.type === 'find' ? '🔍' : item.type === 'claim_registered' ? '📝' : '✅'}
                      </div>
                      <div className="lb-info">
                        <div className="lb-addr">
                          {ACTIVITY_LABEL[item.type]} · {item.tokenSymbol || 'tokens'}
                        </div>
                        <div className="lb-desc">
                          {truncateAddress(item.address)} · {timeAgo(item.timestamp)}
                        </div>
                      </div>
                      <div className="lb-right">
                        <div className="lb-usd">
                          {item.valueUsd != null ? formatUsdShort(item.valueUsd) : '—'}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <PageNav page={activityPage} totalPages={activityTotalPages} onChange={setActivityPage} disabled={activityLoading} />
              </>
            )
            )}
          </div>

          {/* Earnings */}
          <div className="s-card">
            <div className="s-head">
              <div>
                <div className="s-title">{isFounder ? 'Protocol Earnings' : 'Your Recoveries'}</div>
                <div className="s-sub">{isFounder ? 'On-chain fee revenue' : 'Funds you\u2019ve recovered'}</div>
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
                  {isFounder ? (
                    <>
                      <div className="e-row"><span className="e-key">Protocol cut</span><span className="e-val">{stats ? formatUsdShort(stats.protocolFeesUsd) : '$0'}</span></div>
                      <div className="e-row"><span className="e-key">Recoveries settled</span><span className="e-val">{stats ? String(stats.recoveredCount) : '0'}</span></div>
                      <div className="e-div" />
                      <div className="e-total">
                        <span className="e-total-key">Total protocol revenue</span>
                        <span className="e-total-val">{stats ? formatUsdShort(stats.protocolFeesUsd) : '$0'}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="e-row"><span className="e-key">Recovered</span><span className="e-val">{formatUsdShort(userRecovered.total)}</span></div>
                      <div className="e-row"><span className="e-key">Recoveries settled</span><span className="e-val">{String(userRecovered.count)}</span></div>
                      <div className="e-div" />
                      <div className="e-total">
                        <span className="e-total-key">Total recovered</span>
                        <span className="e-total-val">{formatUsdShort(userRecovered.total)}</span>
                      </div>
                      <div style={{ marginTop: '14px', textAlign: 'right' }}>
                        <Link
                          href="/recoveries"
                          style={{
                            padding: '7px 12px', borderRadius: '6px', whiteSpace: 'nowrap',
                            background: 'var(--eth)', color: '#fff', textDecoration: 'none',
                            fontFamily: 'var(--font-mono)', fontSize: '0.64rem', fontWeight: 600,
                          }}
                        >
                          View All Recoveries
                        </Link>
                      </div>
                    </>
                  )}
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
          <a href="/privacy">Privacy</a>
          <a
            href="https://x.com/Salvage_xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="d-footer-social"
            title="Salvage on X"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Salvage
          </a>
          <span className="credit">
            Built by{' '}
            <a href="https://x.com/Olumi441" target="_blank" rel="noopener noreferrer">
              Abu Olumi
            </a>
          </span>
        </div>
      </footer>
    </div>
  )
}