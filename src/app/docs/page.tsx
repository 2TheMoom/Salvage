import type { Metadata } from 'next'
import Link from 'next/link'
import SonarLogo from '@/components/ui/SonarLogo'

export const metadata: Metadata = {
  title: 'Docs — Salvage',
  description:
    'How Salvage recovers stranded ERC-20 tokens: the scan-register-rescue-settle flow, fee schedule, security model, and every feature in the app.',
  alternates: { canonical: '/docs' },
}

const TOC = [
  ['overview', 'Overview'],
  ['how-it-works', 'How a recovery works'],
  ['fees', 'Fee schedule'],
  ['scanner', 'Contract Scanner'],
  ['finder', 'Finder registration'],
  ['owner-recovery', 'Owner recovery panel'],
  ['lost-tokens', 'Did I Lose Tokens?'],
  ['mini-app', 'Base App Mini App'],
  ['chrome-extension', 'Chrome extension'],
  ['security', 'Security model'],
  ['contracts', 'Deployed contracts'],
  ['faq', 'FAQ'],
  ['support', 'Support'],
] as const

const FAQ_ITEMS = [
  {
    q: 'Does Salvage ever hold my funds?',
    a: "No. Salvage is non-custodial — recovered tokens flow straight from the stranded contract to a per-claim deposit address, then settle() splits them automatically the moment it's funded. There's no admin key and no path that lets Salvage move funds anywhere else.",
  },
  {
    q: 'What if the contract owner never acts?',
    a: 'Then nothing happens — and nothing was risked. Registering a claim is one free signed message, no gas, no fee, no deadline. Salvage just guarantees that whenever the owner does act, the split is automatic and trustless.',
  },
  {
    q: 'Is there a fee?',
    a: 'Only on a successful recovery: 5% to protocol if no finder was involved, or 3% protocol + 7% to the finder if someone registered the find first. Nothing is ever charged upfront — if anyone asks you to pay before funds move, that’s not Salvage.',
  },
  {
    q: 'How is this different from "fund recovery" scams?',
    a: 'Those work by DMing victims and demanding payment before anything is returned. Salvage never contacts you first, never asks for money, and never takes custody — every contract is verified and public, and every settlement is a transaction you can check yourself.',
  },
  {
    q: 'I found stranded tokens in someone else’s contract — what now?',
    a: 'Register the find, free and gasless. If the owner later recovers those tokens through Salvage, 7% routes to your wallet automatically the moment they settle — no need to contact them yourself, though Salvage can generate an outreach message if you want to speed it along.',
  },
  {
    q: 'Which wallet ownership patterns does the owner panel detect?',
    a: 'Standard Ownable-style contracts today, where a single owner() address is checked against your connected wallet. Role-based AccessControl ownership isn’t detected yet, so the owner panel simply won’t appear for those rather than guess wrong.',
  },
  {
    q: 'Which chains are supported?',
    a: 'Ethereum and Base today, with Circle’s Arc mainnet planned shortly after it launches — same router logic, just a new chain config.',
  },
]

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <th style={{
      textAlign: align, padding: '8px 12px', fontSize: '0.7rem', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-3)',
      borderBottom: '1px solid var(--border-md)',
    }}>
      {children}
    </th>
  )
}

function Td({ children, align = 'left', mono = false }: { children: React.ReactNode; align?: 'left' | 'right' | 'center'; mono?: boolean }) {
  return (
    <td style={{
      textAlign: align, padding: '10px 12px', fontSize: '0.85rem', color: 'var(--text)',
      borderBottom: '1px solid var(--border)',
      fontFamily: mono ? 'var(--font-mono)' : undefined,
    }}>
      {children}
    </td>
  )
}

export default function DocsPage() {
  return (
    <div id="docs">
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
        <div className="legal-container" style={{ maxWidth: '860px' }}>
          <h1 className="legal-title">Documentation</h1>
          <div className="legal-updated">Last updated: July 22, 2026</div>

          <p>
            Salvage recovers ERC-20 tokens stranded in smart contracts — sent there by mistake,
            with no built-in way for the EVM to send them back. This page documents how the
            protocol and app actually work: the on-chain settlement mechanics, the fee schedule,
            what each part of the app does, and the security model behind it.
          </p>

          <div className="e-body" style={{
            padding: '18px 20px', marginBottom: '36px', borderRadius: '12px',
            background: 'var(--card)', border: '1px solid var(--border-md)',
          }}>
            <div className="docs-label">On this page</div>
            <div className="docs-chip-row">
              {TOC.map(([id, label]) => (
                <a key={id} className="docs-chip" href={`#${id}`}>{label}</a>
              ))}
            </div>
          </div>

          <section className="legal-section" id="overview" style={{ scrollMarginTop: '80px' }}>
            <h2>Overview</h2>
            <p>
              Any ERC-20 contract address looks identical to a wallet address — tokens get sent
              there by accident, and without a rescue function built in, they sit in the
              contract&apos;s balance permanently. Salvage is the intelligence and settlement
              layer that connects that stranded value to the people who can recover it: scan a
              contract or wallet, find out whether recovery is technically possible, and settle
              the recovery trustlessly on-chain if it is.
            </p>
            <p>
              Recovery always requires the contract&apos;s owner to act — no tool can force that.
              What Salvage guarantees is that once an owner does act, the split between victim,
              finder, and protocol is automatic, on-chain, and auditable. Nobody, including
              Salvage, ever custodies the funds in between.
            </p>
          </section>

          <section className="legal-section" id="how-it-works" style={{ scrollMarginTop: '80px' }}>
            <h2>How a recovery works</h2>
            <ul>
              <li>
                <strong>1. Scan.</strong> Paste a contract or wallet address. Salvage checks
                token balances, contract verification status, and looks for a rescue function
                and an active owner.
              </li>
              <li>
                <strong>2. Register.</strong> The victim (or a finder, if someone spotted it
                first) signs an EIP-712 <code>RecoveryClaim</code>. That claim gets its own
                unique, deterministic CREATE2 deposit address — never a shared pot, so claims
                can never be confused or cross-drained.
              </li>
              <li>
                <strong>3. Rescue.</strong> The contract&apos;s owner moves the stranded tokens
                to that claim&apos;s deposit address, using whichever rescue mechanism the
                contract exposes.
              </li>
              <li>
                <strong>4. Settle.</strong> Once the deposit address is funded, anyone can call{' '}
                <code>settle()</code> — it&apos;s permissionless. It sweeps the receiver and
                splits the funds automatically according to the schedule that was frozen at
                registration.
              </li>
            </ul>
          </section>

          <section className="legal-section" id="fees" style={{ scrollMarginTop: '80px' }}>
            <h2>Fee schedule</h2>
            <p>
              Frozen per claim at registration and enforced by the contract — never charged
              upfront, only on a successful settlement.
            </p>
            <div style={{ overflowX: 'auto', marginBottom: '10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <Th>Flow</Th>
                    <Th align="right">Victim</Th>
                    <Th align="right">Finder</Th>
                    <Th align="right">Protocol</Th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <Td>Victim-initiated</Td>
                    <Td align="right" mono>95%</Td>
                    <Td align="right" mono>—</Td>
                    <Td align="right" mono>5%</Td>
                  </tr>
                  <tr>
                    <Td>Finder-brokered</Td>
                    <Td align="right" mono>90%</Td>
                    <Td align="right" mono>7%</Td>
                    <Td align="right" mono>3%</Td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="legal-section" id="scanner" style={{ scrollMarginTop: '80px' }}>
            <h2>Contract Scanner</h2>
            <p>
              Paste any ERC-20 contract on Ethereum or Base. Salvage sweeps every token balance
              the contract holds, prices holdings via Alchemy&apos;s Prices API, and runs
              recovery triage: is the contract verified, does its ABI expose a rescue function,
              is it an upgradeable proxy, and is there an owner who can act? The verdict —
              Recoverable, Needs Action, or Unrecoverable — comes with a ready-to-send outreach
              message for the contract&apos;s team.
            </p>
            <p>
              <strong>Triage caveat:</strong> the scanner detects the <em>presence</em> of rescue
              functions and ownership patterns in the ABI — it doesn&apos;t verify whether the
              owner can or will actually act. A rescue function gated behind a timelock, or an
              owner pointing at a multisig that&apos;s lost its signers, still reads as
              &ldquo;Recoverable&rdquo; today. Treat the verdict as &ldquo;a path plausibly
              exists,&rdquo; not a guarantee.
            </p>
          </section>

          <section className="legal-section" id="finder" style={{ scrollMarginTop: '80px' }}>
            <h2>Finder registration</h2>
            <p>
              Anyone can discover a stranded balance before the affected team or victim does.
              Registering a find is off-chain and gasless: the finder signs a plain message
              (EIP-191) agreeing to the fee schedule, recorded under a deterministic key —
              first writer wins. No victim signature is required at this stage; it only locks in
              priority on the 7% finder fee.
            </p>
            <p>
              A victim can&apos;t register as their own finder — rejected both off-chain and
              on-chain (the router reverts if <code>finder == victim</code>). Stale
              registrations expire after 90 days unless the claim has already settled, so an
              abandoned registration can&apos;t permanently block a find. Victim contact today is
              manual — the finder reaches out using the app&apos;s generated outreach message.
            </p>
          </section>

          <section className="legal-section" id="owner-recovery" style={{ scrollMarginTop: '80px' }}>
            <h2>Owner recovery panel</h2>
            <p>
              If the wallet you connect matches a scanned contract&apos;s on-chain{' '}
              <code>owner()</code>, a recovery panel appears automatically for each stranded
              token: register the claim (crediting whichever finder registered first, if any),
              get a deterministic deposit address, rescue the tokens to it, and settle — the same
              trustless flow above, not just an outreach template.
            </p>
            <p>
              When triage detects a rescue function, the panel decodes its real ABI signature and
              shows a call preview with editable, best-effort-prefilled parameters, plus a raw
              calldata copy button — Salvage builds the preview, but the owner is always the one
              who submits the transaction. For contracts holding several stranded tokens,
              &ldquo;Register All&rdquo; and &ldquo;Settle All&rdquo; walk through every token in
              one guided sequence; settlement across a batch happens in a single transaction.
              Only standard Ownable-style contracts are detected today — role-based
              (AccessControl) ownership isn&apos;t, so the panel simply won&apos;t appear rather
              than guess wrong.
            </p>
          </section>

          <section className="legal-section" id="lost-tokens" style={{ scrollMarginTop: '80px' }}>
            <h2>Did I Lose Tokens?</h2>
            <p>
              Paste your wallet address and Salvage scans your transfer history for the classic
              mistake — tokens sent directly to a token contract&apos;s own address — verified
              on-chain via calldata analysis. Each finding shows what you lost, whether the
              contract still holds it, and whether a recovery path exists.
            </p>
          </section>

          <section className="legal-section" id="mini-app" style={{ scrollMarginTop: '80px' }}>
            <h2>Base App Mini App</h2>
            <p>
              Salvage runs natively inside the Base App as a Mini App, wallet already connected —
              one tap scans it across both Ethereum and Base in parallel. Signing the EIP-712
              claim, registering it on-chain, and settling once funded all happen natively in the
              Mini App, no redirect to the website required. Scope is deliberately narrower than
              the web app: the Contract Scanner and the owner-side recovery panel stay web-only.
            </p>
          </section>

          <section className="legal-section" id="chrome-extension" style={{ scrollMarginTop: '80px' }}>
            <h2>Chrome extension</h2>
            <p>
              &ldquo;Stranded Token Warning&rdquo; watches address fields on any page you visit
              and warns before you send if the recipient has contract code on Ethereum or Base —
              the #1 way tokens get permanently stranded, caught before it happens instead of
              recovered after. A toolbar popup (<code>Alt+Shift+S</code> /{' '}
              <code>Cmd+Shift+S</code>) also lets you check an address manually.
            </p>
            <p>
              <strong>Known gap:</strong> content scripts can&apos;t inject into another
              extension&apos;s own popup UI — a Chrome security boundary, not a bug — so it
              doesn&apos;t fire inside MetaMask/Coinbase Wallet/Rabby&apos;s native send screens,
              only on address fields in regular webpages and Salvage&apos;s own popup. Not yet on
              the Chrome Web Store (submission pending review) — install it now as an unpacked
              extension from the{' '}
              <a className="docs-chip" href="https://github.com/2TheMoom/Salvage/tree/main/chrome-extension" target="_blank" rel="noopener noreferrer">
                chrome-extension source ↗
              </a>.
            </p>
          </section>

          <section className="legal-section" id="security" style={{ scrollMarginTop: '80px' }}>
            <h2>Security model</h2>
            <p>The router is designed so most attacks die by construction:</p>
            <ul>
              <li><strong>Per-claim CREATE2 receivers</strong> — no shared pot; claims can never be confused or cross-drained.</li>
              <li><strong>Front-running settle() is harmless</strong> — payout addresses and splits are frozen at registration; a front-runner just pays your gas.</li>
              <li><strong>No admin path to funds</strong> — the owner can only change where future protocol fees go; claim receivers are untouchable even with a compromised key.</li>
              <li><strong>Non-upgradeable</strong>, zero external dependencies, no delegatecall.</li>
              <li><strong>EIP-712 signatures</strong> with deadline expiry and malleability rejection.</li>
              <li><strong>Balance-delta accounting</strong> — fee-on-transfer tokens split correctly.</li>
              <li><strong>Residual-safe</strong> — settle() can run again if more tokens arrive later.</li>
            </ul>
            <p>
              All active contracts are verified on Etherscan/Basescan, Blockscout, and Sourcify.
              The application layer gets the same scrutiny: row-level security denies writes from
              the public database key by default, and scan endpoints are rate-limited to stop
              scripted abuse from running up API costs.
            </p>
          </section>

          <section className="legal-section" id="contracts" style={{ scrollMarginTop: '80px' }}>
            <h2>Deployed contracts</h2>
            <div style={{ overflowX: 'auto', marginBottom: '10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <Th>Contract</Th>
                    <Th>Ethereum</Th>
                    <Th>Base</Th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <Td>SalvageRecoveryRouter</Td>
                    <Td>
                      <a className="docs-chip" href="https://etherscan.io/address/0xD9A5f1Fcf39F99152d6443132B21C1D8f7fAAC25#code" target="_blank" rel="noopener noreferrer">0xD9A5…AC25 ↗</a>
                    </Td>
                    <Td>
                      <a className="docs-chip" href="https://basescan.org/address/0x2240792d1A9D964d238bD693fCb09586B10faEdf#code" target="_blank" rel="noopener noreferrer">0x2240…aEdf ↗</a>
                    </Td>
                  </tr>
                  <tr>
                    <Td>SalvageBatchWrapper</Td>
                    <Td>
                      <a className="docs-chip" href="https://etherscan.io/address/0xff2605c1cFC8fF3b2c8Dfde91E72E98595676995#code" target="_blank" rel="noopener noreferrer">0xff26…6995 ↗</a>
                    </Td>
                    <Td>
                      <a className="docs-chip" href="https://basescan.org/address/0xAe2A4E0f19300eBAA8D9408210F941A771103690#code" target="_blank" rel="noopener noreferrer">0xAe2A…3690 ↗</a>
                    </Td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '0.8rem' }}>
              Both are active. An earlier <code>SalvageFeeContract</code> design (manual
              founder-confirmed recoveries) is fully superseded and no longer called by the app —
              it never held stranded ERC-20 tokens.
            </p>
          </section>

          <section className="legal-section" id="faq" style={{ scrollMarginTop: '80px' }}>
            <h2>FAQ</h2>
            {FAQ_ITEMS.map((item) => (
              <div key={item.q} style={{ marginBottom: '18px' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
                  {item.q}
                </div>
                <p style={{ marginBottom: 0 }}>{item.a}</p>
              </div>
            ))}
          </section>

          <section className="legal-section" id="support" style={{ scrollMarginTop: '80px' }}>
            <h2>Support</h2>
            <p>Questions, bug reports, or something not covered here — reach out any of these ways:</p>
            <div className="docs-chip-row" style={{ marginBottom: '14px' }}>
              <a className="docs-chip" href="mailto:gethelp.salvage@gmail.com">gethelp.salvage@gmail.com</a>
              <a className="docs-chip" href="https://x.com/Salvage_xyz" target="_blank" rel="noopener noreferrer">@Salvage_xyz on X</a>
              <a className="docs-chip" href="https://warpcast.com/salvage-xyz" target="_blank" rel="noopener noreferrer">@Salvage-xyz on Farcaster</a>
              <a className="docs-chip" href="https://github.com/2TheMoom/Salvage" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
            </div>
            <p style={{ fontSize: '0.8rem' }}>
              Contract source and the full technical repo live on GitHub, linked above.
            </p>
          </section>
        </div>
      </div>

      <footer className="l-footer">
        <div className="l-footer-left">
          <div>Salvage v0.1 · Ethereum + Base · Alchemy + Etherscan API V2</div>
        </div>
        <div className="l-footer-right">
          <Link href="/docs">Docs</Link>
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
