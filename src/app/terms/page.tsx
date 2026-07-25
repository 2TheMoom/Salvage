import type { Metadata } from 'next'
import Link from 'next/link'
import SonarLogo from '@/components/ui/SonarLogo'

export const metadata: Metadata = {
  title: 'Terms of Service — Salvage',
  description:
    'What using Salvage means: no guarantee of recovery, a fixed and non-negotiable fee schedule, and a protocol that never custodies funds or controls outcomes.',
  alternates: { canonical: '/terms' },
}

export default function TermsPage() {
  return (
    <div id="terms">
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
          <h1 className="legal-title">Terms of Service</h1>
          <div className="legal-updated">Last updated: July 25, 2026</div>

          <p>
            Salvage (&ldquo;Salvage&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) operates a scanner and a
            non-custodial settlement protocol for ERC-20 tokens stranded in smart contracts, at{' '}
            <a href="https://usesalvage.xyz">usesalvage.xyz</a> and the Base App Mini App. By connecting a
            wallet, registering a find, registering a claim, or otherwise using Salvage, you agree to these
            terms. If you don&apos;t agree, don&apos;t use the app.
          </p>

          <section className="legal-section">
            <h2>No guarantee of recovery</h2>
            <p>
              Salvage finds stranded funds and builds the safest available path to return them —
              recovery always requires the contract&apos;s owner to act. No tool, including Salvage,
              can force that. Registering a claim or a find does not guarantee any tokens will ever be
              recovered, and Salvage makes no promise about whether or when an owner will act.
            </p>
            <p>
              The scanner&apos;s &ldquo;Recoverable&rdquo; verdict reflects what its triage checks can
              detect in a contract&apos;s ABI and ownership — the presence of a rescue function, an
              active owner, verification status. It does not verify that the owner can or will actually
              use that function. A rescue function gated behind a timelock, or an owner pointing at a
              multisig that&apos;s lost its signers, can still read as &ldquo;Recoverable&rdquo; today.
              Treat every verdict as &ldquo;a path plausibly exists,&rdquo; never as a guarantee.
            </p>
          </section>

          <section className="legal-section">
            <h2>Fees are fixed and non-negotiable</h2>
            <p>
              Every claim is settled under one of two fee splits, frozen at the moment the claim is
              registered and enforced by the router contract itself — not by Salvage, and not open to
              renegotiation afterward, by us or by you:
            </p>
            <ul>
              <li><strong>Victim-initiated:</strong> 95% to the victim, 5% to the protocol.</li>
              <li><strong>Finder-brokered:</strong> 90% to the victim, 7% to the finder, 3% to the protocol.</li>
            </ul>
            <p>
              There is no fee for registering a claim or a find, and no fee is ever charged unless a
              recovery actually settles. Which split applies is determined by whether a finder had
              already registered the find before the claim was signed — see below.
            </p>
          </section>

          <section className="legal-section">
            <h2>Finder priority</h2>
            <p>
              Finder priority goes to whoever registers a find first, full stop. Registration is
              timestamped and enforced by a unique constraint at the moment it&apos;s written — first
              writer wins, and that record is what determines the finder credited on a claim, not a
              later claim of having spotted it earlier. If you believe a registration is fraudulent or
              made in bad faith, contact us (see below); we can investigate, but we cannot alter a
              claim&apos;s fee split once it has settled on-chain — see the next section.
            </p>
          </section>

          <section className="legal-section">
            <h2>We don&apos;t custody funds or control outcomes</h2>
            <p>
              Salvage is non-custodial by design: recovered tokens flow directly from the stranded
              contract to a claim&apos;s own deterministic deposit address, and <code>settle()</code> —
              callable by anyone, not just us — splits them automatically the moment it&apos;s funded.
              We never hold, route, or have the ability to redirect a settlement. This means we also
              cannot reverse one, adjust a split after the fact, or manually resolve a dispute over a
              settled claim — there is no admin key or override path, by design, and we would not use one
              if it existed.
            </p>
          </section>

          <section className="legal-section">
            <h2>Scam warning</h2>
            <p>
              Salvage never DMs you first, never asks for payment before funds move, and never asks for
              your seed phrase or private key. If anyone contacts you promising guaranteed fund recovery
              in exchange for an upfront fee, that is not Salvage and it is a scam — reporting it to us
              (see below) helps us warn others.
            </p>
          </section>

          <section className="legal-section">
            <h2>No warranty</h2>
            <p>
              Salvage is provided &ldquo;as is,&rdquo; without warranty of any kind. Scan results,
              triage verdicts, USD value estimates, and outreach message drafts are best-effort and may
              be inaccurate or incomplete. You are responsible for verifying any contract, address, or
              transaction yourself before relying on it — every claim and settlement is a public,
              verifiable on-chain transaction, and we encourage you to check it.
            </p>
          </section>

          <section className="legal-section">
            <h2>Limitation of liability</h2>
            <p>
              To the fullest extent permitted by law, Salvage and its operator are not liable for any
              loss arising from your use of the app or protocol — including a contract owner never
              acting, a scan or triage result that turns out to be wrong, or a transaction you sign
              through Salvage&apos;s interface. You interact with smart contracts, including
              Salvage&apos;s own router, entirely at your own risk.
            </p>
          </section>

          <section className="legal-section">
            <h2>Changes to these terms</h2>
            <p>
              If these terms change materially, we&apos;ll update the date at the top of this page.
              Continued use of Salvage after a change means you accept the updated terms.
            </p>
          </section>

          <section className="legal-section">
            <h2>Contact</h2>
            <p>
              Questions about these terms, or something to report:{' '}
              <a href="mailto:gethelp.salvage@gmail.com">gethelp.salvage@gmail.com</a>.
            </p>
          </section>
        </div>
      </div>

      <footer className="l-footer">
        <div className="l-footer-left">
          <div>Salvage v0.1 · Ethereum + Base · Alchemy + Etherscan API V2</div>
        </div>
        <div className="l-footer-right">
          <Link href="/terms">Terms</Link>
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
