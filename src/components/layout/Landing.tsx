'use client'

import { useState, useEffect } from 'react'
import SonarLogo from '@/components/ui/SonarLogo'

interface LandingProps {
  onOpenDashboard: () => void
}

export default function Landing({ onOpenDashboard }: LandingProps) {
  const [stats, setStats] = useState<{
    totalStrandedUsd: number
    recoverableUsd: number
  } | null>(null)

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(d => { if (d.success) setStats(d.stats) })
      .catch(() => {})
  }, [])

  const fmtUsd = (v: number) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M`
    : v >= 1_000   ? `$${(v / 1_000).toFixed(1)}K`
    : `$${v.toFixed(0)}`

  return (
    <div id="landing">
      {/* Nav */}
      <nav className="l-nav">
        <SonarLogo size={30} variant="white" showWordmark wordmarkSize="1.2rem" />
        <div className="l-nav-right">
          <span className="badge-live">● LIVE</span>
          <button className="btn-nav-ghost">Leaderboard</button>
          <button className="btn-nav-primary" onClick={onOpenDashboard}>
            Open Dashboard
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div className="l-hero">
        <div>
          <div className="hero-eyebrow">EVM Recovery Intelligence · Ethereum + Base</div>
          <h1 className="hero-h1">
            Tokens trapped<br />in contracts that<br />can&apos;t spend them.
          </h1>
          <div className="hero-tagline">&ldquo;What the EVM left behind.&rdquo;</div>
          <p className="hero-p">
            ERC-20 tokens sent to immovable contracts sit there permanently — unless
            someone finds them first. Salvage is the intelligence layer. You scan,
            you find, you earn.
          </p>
          <div className="hero-ctas">
            <button className="btn-hero-primary" onClick={onOpenDashboard}>
              Open Dashboard
            </button>
            <button className="btn-hero-ghost">View Leaderboard</button>
          </div>
          <div className="hero-proof">
            <span>Ethereum mainnet</span>
            <span>Base mainnet</span>
            <span>Alchemy + Etherscan API</span>
            <span>On-chain fee contract</span>
          </div>
        </div>

        {/* Hero preview card */}
        <div className="hero-card">
          <div className="hc-bar">
            <span className="hc-bar-title">Live scan · 0xa0b8…eb48</span>
            <span className="hc-bar-badge">Ethereum</span>
          </div>
          <div className="hc-row"><span className="hc-label">Token</span><span className="hc-val eth">USD Coin (USDC)</span></div>
          <div className="hc-row"><span className="hc-label">Stranded value</span><span className="hc-val eth">$284,500</span></div>
          <div className="hc-row"><span className="hc-label">Your finder&apos;s fee (7%)</span><span className="hc-val green">$19,915</span></div>
          <div className="hc-row"><span className="hc-label">rescueERC20() in ABI</span><span className="hc-val green">Found ✓</span></div>
          <div className="hc-row"><span className="hc-label">owner() active</span><span className="hc-val green">Active ✓</span></div>
          <div className="hc-row"><span className="hc-label">Recovery status</span><span className="hc-val green">Recoverable ✓</span></div>
          <div className="hc-footer">
            <div className="hc-footer-text">
              Register this find on-chain. If the project recovers within 90 days,
              your 7% routes to your wallet automatically.
            </div>
            <button className="hc-action" onClick={onOpenDashboard}>
              Register This Find →
            </button>
          </div>
        </div>
      </div>

      {/* Problem strip */}
      <div className="l-problem">
        <div className="problem-inner">
          <div className="problem-item">
            <div className="problem-heading">The mistake is easy.</div>
            <div className="problem-body">
              Any ERC-20 contract address looks identical to a wallet. Tokens get sent
              there by accident. The EVM has no mechanism to refuse them or send them back.
            </div>
          </div>
          <div className="problem-item">
            <div className="problem-heading">The loss is permanent.</div>
            <div className="problem-body">
              Without a rescue function, tokens sit in the contract balance forever.
              No refund, no burn, no path out. Most project teams don&apos;t even know it happened.
            </div>
          </div>
          <div className="problem-item">
            <div className="problem-heading">Until now.</div>
            <div className="problem-body">
              Most contracts with rescue functions never get called — because nobody is
              watching. Salvage connects stranded value to the people who can recover it.
            </div>
          </div>
        </div>
        <div className="problem-cta-strip">
          <div>
            <div className="problem-cta-text">
              Salvage <span>recovers</span> what the EVM forgot to protect.
            </div>
            <div className="problem-cta-sub">Find it. Claim it. Recover it.</div>
          </div>
          <button
            className="btn-nav-primary"
            onClick={onOpenDashboard}
            style={{ fontSize: '0.95rem', padding: '11px 28px' }}
          >
            Start Scanning →
          </button>
        </div>
      </div>

      {/* How it works */}
      <div className="l-light">
        <div className="l-light-inner">
          <div className="section-eyebrow">How it works</div>
          <h2 className="section-h2">
            Three steps to a <span>finder&apos;s fee.</span>
          </h2>
          <div className="how-grid">
            <div className="how-card">
              <div className="how-step">Step 01 · Scan</div>
              <div className="how-title">Paste a contract address</div>
              <div className="how-body">
                We check the ABI for rescue functions, detect proxy patterns, verify the
                owner is active, and sweep the top ERC-20 balances held inside.
              </div>
            </div>
            <div className="how-card">
              <div className="how-step">Step 02 · Register</div>
              <div className="how-title">Claim your find on-chain</div>
              <div className="how-body">
                Register via the Salvage fee contract on Base. Your address and timestamp
                are recorded permanently — proving you found it first.
              </div>
            </div>
            <div className="how-card">
              <div className="how-step">Step 03 · Earn</div>
              <div className="how-title">Collect when they recover</div>
              <div className="how-body">
                Reach out to the team with our generated outreach template. When they
                execute recovery within 90 days, 7% routes directly to your wallet.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="l-stats">
        <div className="l-stats-inner">
          <div className="l-stat">
            <div className="l-stat-label">Total Stranded · ETH + Base</div>
            <div className="l-stat-num">{stats ? fmtUsd(stats.totalStrandedUsd) : '—'}</div>
            <div className="l-stat-sub">{stats ? 'Live from scanned contracts' : 'Loading…'}</div>
          </div>
          <div className="l-stat">
            <div className="l-stat-label">Recoverable Value</div>
            <div className="l-stat-num accent">{stats ? fmtUsd(stats.recoverableUsd) : '—'}</div>
            <div className="l-stat-sub">{stats ? 'With a rescue path today' : 'Loading…'}</div>
          </div>
          <div className="l-stat">
            <div className="l-stat-label">All-Time Recovered</div>
            <div className="l-stat-num">$0</div>
            <div className="l-stat-sub">No recoveries yet</div>
          </div>
          <div className="l-stat">
            <div className="l-stat-label">Protocol Fees Earned</div>
            <div className="l-stat-num accent">$0</div>
            <div className="l-stat-sub">3% cut · on-chain to founder</div>
          </div>
        </div>
      </div>

      {/* CTA strip */}
      <div className="l-cta">
        <h2>Start scanning now.</h2>
        <p>No signup. No KYC. Connect a wallet and start finding stranded tokens.</p>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
          opacity: 0.75, marginTop: '6px',
        }}>
          Sent tokens to a contract by mistake? Scan your own wallet — recovery settles
          on-chain: 3% protocol + 7% finder when a finder brokers it · 5% protocol when
          you recover your own. Non-custodial, enforced by contract.
        </p>
        <button className="btn-cta-white" onClick={onOpenDashboard}>Open Dashboard</button>
        <button className="btn-cta-outline">View Leaderboard</button>
      </div>

      {/* Footer */}
      <footer className="l-footer">
        <div className="l-footer-left">
          <div>Salvage v0.1 · Ethereum + Base · Alchemy + Etherscan API V2</div>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginTop: '10px' }}>
            {/* GitHub */}
            <a href="https://github.com/2TheMoom/Salvage" target="_blank" rel="noopener noreferrer"
               title="GitHub — 2TheMoom/Salvage" style={{ opacity: 0.85, display: 'flex' }}>
              <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-label="GitHub">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
              </svg>
            </a>
            {/* X — Salvage */}
            <a href="https://x.com/Salvage_xyz" target="_blank" rel="noopener noreferrer"
               title="X — @Salvage_xyz" style={{ opacity: 0.85, display: 'flex' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-label="X">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
            {/* Gmail */}
            <a href="mailto:gethelp.salvage@gmail.com"
               title="Email — gethelp.salvage@gmail.com" style={{ opacity: 0.85, display: 'flex' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-label="Gmail">
                <path d="M22 6.5v11a1.5 1.5 0 0 1-1.5 1.5H19V9.62l-7 4.9-7-4.9V19H3.5A1.5 1.5 0 0 1 2 17.5v-11C2 5.4 2.9 4.5 4 4.5h.5L12 9.75 19.5 4.5h.5c1.1 0 2 .9 2 2z" fill="#EA4335"/>
                <path d="M5 19V9.62l7 4.9 7-4.9V19H5z" fill="#fff" fillOpacity="0.9"/>
              </svg>
            </a>
            {/* Farcaster */}
            <a href="https://warpcast.com/salvage-xyz" target="_blank" rel="noopener noreferrer"
               title="Farcaster — @Salvage-xyz" style={{ opacity: 0.85, display: 'flex' }}>
              <svg width="17" height="17" viewBox="0 0 1000 1000" fill="#855DCD" aria-label="Farcaster">
                <path d="M257 156h486v688h-71V529h-.7c-7.8-87-81-155-170.3-155s-162.5 68-170.3 155h-.7v315h-71V156z"/>
                <path d="M128 253l29 98h25v395c-12.5 0-22.6 10.1-22.6 22.6V795h-4.5c-12.5 0-22.6 10.1-22.6 22.6V844h253v-26.4c0-12.5-10.1-22.6-22.6-22.6h-4.5v-26.4c0-12.5-10.1-22.6-22.6-22.6h-27V253H128zM679 746c-12.5 0-22.6 10.1-22.6 22.6V795h-4.5c-12.5 0-22.6 10.1-22.6 22.6V844h253v-26.4c0-12.5-10.1-22.6-22.6-22.6h-4.5v-26.4c0-12.5-10.1-22.6-22.6-22.6V351h25l29-98H706v493h-27z"/>
              </svg>
            </a>
          </div>
        </div>
        <div className="l-footer-right">
          <a href="#">Docs</a>
          <a href="#">Fee Contract</a>
          <span className="credit">
            Built by{' '}
            <a href="https://x.com/Olumi441" target="_blank" rel="noopener noreferrer">
              Abu Olumi ↗
            </a>
          </span>
        </div>
      </footer>
    </div>
  )
}