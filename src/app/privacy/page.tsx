import type { Metadata } from 'next'
import Link from 'next/link'
import SonarLogo from '@/components/ui/SonarLogo'

export const metadata: Metadata = {
  title: 'Privacy Policy — Salvage',
  description:
    'How Salvage handles wallet addresses, on-chain data, and off-chain claim/find records when you use the app.',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPage() {
  return (
    <div id="privacy">
      <nav className="l-nav">
        <Link href="/" style={{ display: 'flex' }}>
          <SonarLogo size={30} variant="white" showWordmark wordmarkSize="1.2rem" />
        </Link>
        <div className="l-nav-right">
          <Link href="/" className="btn-nav-ghost" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            ← Back to Salvage
          </Link>
        </div>
      </nav>

      <div className="legal-page">
        <div className="legal-container">
          <h1 className="legal-title">Privacy Policy</h1>
          <div className="legal-updated">Last updated: July 9, 2026</div>

          <p>
            Salvage (&ldquo;Salvage&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a non-custodial
            recovery protocol for stranded ERC-20 tokens. This page explains what data the app at{' '}
            <a href="https://usesalvage.xyz">usesalvage.xyz</a> and the Base App Mini App collect,
            why, and who it&apos;s shared with. We built Salvage to need as little data as possible
            to work — most of what it touches is already public on-chain.
          </p>

          <section className="legal-section">
            <h2>What we collect</h2>
            <ul>
              <li>
                <strong>Wallet address.</strong> When you connect a wallet, we see the public
                address you connect with. We never have access to private keys, seed phrases, or
                custody of your funds — every transaction is signed by you in your own wallet.
              </li>
              <li>
                <strong>Addresses and transaction data you submit for scanning.</strong> Contract
                addresses, wallet addresses, and transaction hashes you paste into the scanner are
                sent to our server so it can query Alchemy and Etherscan on your behalf. This data
                is already public on the relevant blockchain.
              </li>
              <li>
                <strong>Signed messages and claims.</strong> If you register a &ldquo;find&rdquo;
                or start a recovery claim, we store the wallet address involved, the message
                signature, the relevant token address and transaction hash, and the USD value at
                time of scan in our database (Supabase). This is what powers first-finder-wins
                priority and claim/settlement tracking, and it mirrors information that is (or
                becomes, once a claim is registered on-chain) publicly visible on Ethereum or Base
                anyway.
              </li>
              <li>
                <strong>Mini App notification opt-in.</strong> If you open Salvage inside the Base
                App and it has notification permissions, we may store your wallet address to
                notify you about recovery-relevant activity in the future. We do not currently send
                notifications — this is opt-in data collection ahead of that feature shipping.
              </li>
            </ul>
            <p>
              We do not collect names, email addresses, or physical addresses unless you email us
              directly. We do not use advertising cookies or ad-tracking pixels.
            </p>
          </section>

          <section className="legal-section">
            <h2>Chrome extension</h2>
            <p>
              The Salvage Chrome extension (&ldquo;Stranded Token Warning&rdquo;) watches text and
              textarea fields on every page you visit for a pattern that looks like an EVM address
              (<code>0x</code> followed by 40 hex characters) as you type or paste. It does not read,
              store, or transmit anything else you type — only a matched address pattern, and only
              once one appears.
            </p>
            <p>
              When a match is found, the extension sends that address to Salvage&apos;s own{' '}
              <code>usesalvage.xyz</code> API to check whether it has contract code on Ethereum or
              Base — the same check the scanner on this site performs. The extension&apos;s{' '}
              <code>host_permissions</code> are scoped to <code>usesalvage.xyz</code> only, so it
              cannot send data to, or fetch code from, any other destination. Nothing is sent to
              third-party analytics, and no browsing history or page content beyond the matched
              address is ever collected. Address checks may be cached locally in your browser
              (<code>chrome.storage.session</code>) for up to 10 minutes to avoid redundant checks;
              this cache is cleared automatically and never leaves your device.
            </p>
          </section>

          <section className="legal-section">
            <h2>What we don&apos;t control</h2>
            <p>
              Our hosting and infrastructure providers (Vercel, Alchemy, Etherscan, Supabase) may
              log standard technical/operational data as part of running their services — things
              like IP address, request timestamps, and user-agent strings. This is normal
              infrastructure logging, not something Salvage requests or has special access to beyond
              what&apos;s needed to keep the app running.
            </p>
          </section>

          <section className="legal-section">
            <h2>Third parties we rely on</h2>
            <ul>
              <li><strong>Alchemy</strong> — RPC access and token/pricing data for scans.</li>
              <li><strong>Etherscan (API v2)</strong> — contract verification status and ABI data.</li>
              <li><strong>Supabase</strong> — database for the finds/claims registry and leaderboard.</li>
              <li><strong>Vercel</strong> — application hosting.</li>
              <li>
                <strong>Coinbase Wallet SDK / your browser wallet extension</strong> — used only to
                request signatures and transactions; Salvage never receives your private keys.
              </li>
              <li>
                <strong>Google Search Console</strong> — used to verify site ownership so this site
                can appear correctly in Google Search. This is a one-time verification tag, not
                analytics — it does not track visitors or collect personal data.
              </li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>On-chain data is permanent</h2>
            <p>
              Once a recovery claim is registered or settled on-chain, that transaction is part of
              the public, permanent record of Ethereum or Base — it cannot be edited or deleted by
              us or by you. Anything we store off-chain (Supabase records backing the finds/claims
              registry) exists to support that on-chain process and the leaderboard; it is not
              sold, and it is not used for anything beyond operating Salvage.
            </p>
          </section>

          <section className="legal-section">
            <h2>Your choices</h2>
            <p>
              You can use most of Salvage&apos;s scanning features without connecting a wallet at
              all. If you&apos;d like an off-chain record we hold (e.g. a find registration) removed
              from our database, email us and we&apos;ll act on it — with the caveat that we can&apos;t
              remove anything already committed on-chain, since no one can.
            </p>
          </section>

          <section className="legal-section">
            <h2>Children&apos;s privacy</h2>
            <p>Salvage is not directed at children under 13, and we do not knowingly collect data from them.</p>
          </section>

          <section className="legal-section">
            <h2>Changes to this policy</h2>
            <p>
              If this policy changes materially, we&apos;ll update the date at the top of this page.
              Continued use of Salvage after a change means you accept the updated policy.
            </p>
          </section>

          <section className="legal-section">
            <h2>Contact</h2>
            <p>
              Questions about this policy or your data: <a href="mailto:gethelp.salvage@gmail.com">gethelp.salvage@gmail.com</a>.
            </p>
          </section>
        </div>
      </div>

      <footer className="l-footer">
        <div className="l-footer-left">
          <div>Salvage v0.1 · Ethereum + Base · Alchemy + Etherscan API V2</div>
        </div>
        <div className="l-footer-right">
          <Link href="/privacy">Privacy</Link>
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
