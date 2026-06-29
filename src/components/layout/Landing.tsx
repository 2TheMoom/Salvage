'use client'

import SonarLogo from '@/components/ui/SonarLogo'

interface LandingProps {
  onOpenDashboard: () => void
}

export default function Landing({ onOpenDashboard }: LandingProps) {
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
            <div className="l-stat-num">$148.3M</div>
            <div className="l-stat-sub">14,822 contracts indexed</div>
          </div>
          <div className="l-stat">
            <div className="l-stat-label">Recoverable Value</div>
            <div className="l-stat-num accent">$31.7M</div>
            <div className="l-stat-sub">2,109 with rescue fn</div>
          </div>
          <div className="l-stat">
            <div className="l-stat-label">All-Time Recovered</div>
            <div className="l-stat-num">$9.1M</div>
            <div className="l-stat-sub">since protocol launch</div>
          </div>
          <div className="l-stat">
            <div className="l-stat-label">Protocol Fees Earned</div>
            <div className="l-stat-num accent">$12,640</div>
            <div className="l-stat-sub">3% cut · on-chain to founder</div>
          </div>
        </div>
      </div>

      {/* CTA strip */}
      <div className="l-cta">
        <h2>Start scanning now.</h2>
        <p>No signup. No KYC. Connect a wallet and start finding stranded tokens.</p>
        <button className="btn-cta-white" onClick={onOpenDashboard}>Open Dashboard</button>
        <button className="btn-cta-outline">View Leaderboard</button>
      </div>

      {/* Footer */}
      <footer className="l-footer">
        <div className="l-footer-left">
          Salvage v0.1 · Ethereum + Base · Alchemy + Etherscan API V2 + CoinGecko
        </div>
        <div className="l-footer-right">
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