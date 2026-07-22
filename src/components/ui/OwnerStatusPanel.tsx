'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useReadContract, useWriteContract, useSwitchChain } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { config } from '@/lib/wagmi'
import { RECOVERY_ROUTER_ADDRESS, ROUTER_ABI, USDC_ABI } from '@/lib/contracts'
import { Chain } from '@/types'
import type { FinderFind, FinderClaimStatus } from '@/components/ui/FinderFindCard'
import ShareReceiptButton from './ShareReceiptButton'

const CHAIN_IDS: Record<Chain, 1 | 8453> = { eth: 1, base: 8453 }

interface OwnedContract {
  contract_address: string
  chain: string
  token_name: string
  token_symbol: string
  stranded_value_usd: number
  triage_status: string
}

interface PendingClaim {
  claim_id: string
  chain: string
  token_address: string
  token_symbol: string | null
  value_usd: number | null
  receiver_address: string
  register_tx: string | null
  status: string
}

const SETTLED_STATUSES: FinderClaimStatus[] = ['settled_for_you', 'settled_without_you']
const NEEDS_ATTENTION_STATUSES: FinderClaimStatus[] = ['claimed_without_you', 'settled_without_you']

interface OwnerStatusPanelProps {
  wallet: string
  onViewContract: (address: string, chain: Chain) => void
}

// Surfaces only what Salvage already knows about this wallet, across all
// three roles it might play: contracts it owns (previously scanned, matched
// by on-chain owner()), claims where it's the beneficiary and not yet
// settled, and finds it registered as a finder. Pure DB lookups, never a
// live re-scan (that would undo the rate-limiting work and re-burn
// Alchemy/Etherscan quota on every connect).
export default function OwnerStatusPanel({ wallet, onViewContract }: OwnerStatusPanelProps) {
  const [ownedContracts, setOwnedContracts] = useState<OwnedContract[]>([])
  const [pendingClaims, setPendingClaims] = useState<PendingClaim[]>([])
  const [finderFinds, setFinderFinds] = useState<FinderFind[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(false)
    Promise.all([
      fetch(`/api/owner-status?wallet=${wallet}`).then((r) => r.json()),
      fetch(`/api/finder-status?finder=${wallet}`).then((r) => r.json()),
    ])
      .then(([ownerData, finderData]) => {
        if (ownerData.success) {
          setOwnedContracts(ownerData.ownedContracts || [])
          setPendingClaims(ownerData.pendingClaims || [])
        }
        if (finderData.success) setFinderFinds(finderData.items || [])
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [wallet])

  // Nothing relevant — render nothing at all rather than an empty state.
  // "You have no pending actions" isn't an invitation; it's just noise for
  // the majority of wallets that aren't an owner, victim, or finder of
  // anything yet.
  if (!loaded || (ownedContracts.length === 0 && pendingClaims.length === 0 && finderFinds.length === 0)) {
    return null
  }

  return (
    <div style={{
      marginBottom: '20px', padding: '16px 18px', borderRadius: '10px',
      background: 'var(--eth-soft)', border: '1px solid var(--eth-border)',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--eth)', marginBottom: '10px',
      }}>
        Welcome back — here&apos;s what needs your attention
      </div>

      {ownedContracts.map((c) => (
        <div key={`${c.chain}-${c.contract_address}`} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '9px 0', borderBottom: '1px solid var(--border)', gap: '10px',
        }}>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
              {c.token_name} <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>
                ({c.chain === 'eth' ? 'Ethereum' : 'Base'})
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-2)' }}>
              {c.contract_address.slice(0, 6)}…{c.contract_address.slice(-4)} · ${c.stranded_value_usd.toFixed(2)} stranded
            </div>
          </div>
          <button
            onClick={() => onViewContract(c.contract_address, c.chain as Chain)}
            style={{
              padding: '7px 12px', borderRadius: '6px', border: 'none', whiteSpace: 'nowrap',
              background: 'var(--eth)', color: '#fff', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: '0.64rem', fontWeight: 600,
            }}
          >
            View &amp; Recover
          </button>
        </div>
      ))}

      {pendingClaims.map((claim) => (
        <PendingClaimRow key={claim.claim_id} claim={claim} />
      ))}

      {finderFinds.length > 0 && (
        <FinderFindsSummary finds={finderFinds} wallet={wallet} />
      )}
    </div>
  )
}

const SEEN_SETTLED_KEY_PREFIX = 'salvage_seen_settled_'
const FINDER_FEE_RATE = 0.07

// A wall of every active find gets unwieldy fast once a finder has several
// going at once — the dashboard only ever needs "here's how many still need
// attention," with the full list living on its own page.
//
// A finder is usually not online at the moment their find actually settles,
// so rather than needing a push notification, a newly-settled find gets
// called out specifically the next time they visit — tracked via a
// per-wallet localStorage set of findKeys already shown as "new" (simplest
// option; known limitation is it doesn't sync across devices/browsers).
function FinderFindsSummary({ finds, wallet }: { finds: FinderFind[]; wallet: string }) {
  const unsettled = finds.filter((f) => !SETTLED_STATUSES.includes(f.claimStatus))
  const needsAttention = finds.filter((f) => NEEDS_ATTENTION_STATUSES.includes(f.claimStatus))
  const settledForYou = finds.filter((f) => f.claimStatus === 'settled_for_you')

  const storageKey = `${SEEN_SETTLED_KEY_PREFIX}${wallet.toLowerCase()}`
  // Frozen once per wallet/load — must NOT be recomputed from a "seen" set
  // that this same effect also mutates, or the highlight would flash and
  // disappear within the same tick instead of persisting for the visit.
  const [newlySettled, setNewlySettled] = useState<FinderFind[]>([])

  useEffect(() => {
    let seenSet: Set<string>
    try {
      const raw = localStorage.getItem(storageKey)
      seenSet = new Set(raw ? JSON.parse(raw) : [])
    } catch {
      seenSet = new Set()
    }
    const newly = settledForYou.filter((f) => !seenSet.has(f.findKey))
    setNewlySettled(newly)
    if (newly.length > 0) {
      newly.forEach((f) => seenSet.add(f.findKey))
      try { localStorage.setItem(storageKey, JSON.stringify(Array.from(seenSet))) } catch { /* storage unavailable */ }
    }
    // Only re-derive on wallet change, not on every settledForYou identity
    // change (a mid-visit refetch shouldn't re-trigger the "new" computation
    // and re-mark things already shown this visit).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  return (
    <div style={{ padding: '9px 0' }}>
      {newlySettled.length > 0 && (
        <div style={{
          marginBottom: '10px', padding: '10px 12px', borderRadius: '8px',
          background: 'var(--green-soft)', border: '1px solid var(--green-border)',
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--green)', marginBottom: '6px' }}>
            🎉 {newlySettled.length} new recovery{newlySettled.length === 1 ? '' : 'ies'} settled!
          </div>
          {newlySettled.map((f) => {
            const settledToken = f.tokens.find((t) => t.claimStatus === 'settled_for_you')
            const earnedUsd = f.valueUsd != null ? f.valueUsd * FINDER_FEE_RATE : null
            const contractLabel = f.contractSymbol || f.contractName || 'Unverified contract'
            return (
              <div key={f.findKey} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: '10px', padding: '4px 0',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text)' }}>
                  {contractLabel}{earnedUsd != null && <span style={{ color: 'var(--green)' }}> · ${earnedUsd.toFixed(2)} earned</span>}
                </div>
                {settledToken && (
                  <ShareReceiptButton
                    type="settle" findKey={f.findKey}
                    token={settledToken.tokenAddress} perspective="finder"
                    amountUsd={earnedUsd ?? 0}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
            🔍 {unsettled.length > 0
              ? `${unsettled.length} active finding${unsettled.length === 1 ? '' : 's'} awaiting settlement`
              : `All ${finds.length} finding${finds.length === 1 ? '' : 's'} settled`}
          </div>
          {needsAttention.length > 0 && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--crimson)' }}>
              ⚠ {needsAttention.length} may need your attention
            </div>
          )}
        </div>
        <Link
          href="/finds"
          style={{
            padding: '7px 12px', borderRadius: '6px', whiteSpace: 'nowrap',
            background: 'var(--eth)', color: '#fff', textDecoration: 'none',
            fontFamily: 'var(--font-mono)', fontSize: '0.64rem', fontWeight: 600,
          }}
        >
          View All Findings
        </Link>
      </div>
    </div>
  )
}

function PendingClaimRow({ claim }: { claim: PendingClaim }) {
  const chainId = CHAIN_IDS[claim.chain as Chain]
  const routerAddress = RECOVERY_ROUTER_ADDRESS[chainId]
  const { writeContractAsync } = useWriteContract()
  const { switchChainAsync }   = useSwitchChain()
  const [settling, setSettling] = useState(false)
  const [settleTx, setSettleTx] = useState<string | null>(null)
  const [copied, setCopied]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const { data: receiverBalance, refetch } = useReadContract({
    address: claim.token_address as `0x${string}`,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [claim.receiver_address as `0x${string}`],
    chainId,
  })
  const funded = (receiverBalance ?? 0n) > 0n

  const handleSettle = async () => {
    setError(null)
    try {
      await switchChainAsync({ chainId }).catch(() => {})
      setSettling(true)
      const hash = await writeContractAsync({
        address: routerAddress,
        abi: ROUTER_ABI,
        functionName: 'settle',
        args: [claim.claim_id as `0x${string}`],
        chainId,
      })
      setSettleTx(hash)
      waitForTransactionReceipt(config, { hash, chainId })
        .then(() => fetch('/api/claims', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ claimId: claim.claim_id, settleTx: hash }),
        }))
        .catch(() => {})
      refetch()
    } catch (err) {
      setError(
        err instanceof Error && (err.message.includes('rejected') || err.message.includes('denied'))
          ? 'Transaction rejected.'
          : 'Settlement failed. Please try again.'
      )
    } finally {
      setSettling(false)
    }
  }

  const copyReceiver = async () => {
    try {
      await navigator.clipboard.writeText(claim.receiver_address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  const explorer = claim.chain === 'eth' ? 'etherscan.io' : 'basescan.org'

  return (
    <div style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
            {claim.token_symbol || 'tokens'} claim
            {claim.value_usd != null && <span style={{ color: 'var(--text-2)', fontWeight: 400 }}> · ${claim.value_usd.toFixed(2)}</span>}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem' }}>
            {funded
              ? <span style={{ color: 'var(--green)' }}>● Funded — ready to settle</span>
              : <span style={{ color: 'var(--text-2)' }}>Awaiting deposit to the receiver address</span>}
          </div>
        </div>
        {funded ? (
          <button onClick={handleSettle} disabled={settling}
            style={{
              padding: '7px 12px', borderRadius: '6px', border: 'none', whiteSpace: 'nowrap',
              background: 'var(--green)', color: '#fff', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: '0.64rem', fontWeight: 600,
            }}>
            {settling ? 'Settling…' : 'Settle'}
          </button>
        ) : (
          <button onClick={copyReceiver}
            style={{
              padding: '7px 12px', borderRadius: '6px', border: '1px solid var(--border)', whiteSpace: 'nowrap',
              background: 'var(--card)', color: 'var(--text)', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: '0.64rem', fontWeight: 600,
            }}>
            {copied ? '✓ Copied' : 'Copy Deposit Address'}
          </button>
        )}
      </div>
      {settleTx && (
        <a className="chip-link settled" href={`https://${explorer}/tx/${settleTx}`} target="_blank" rel="noopener noreferrer"
          style={{ marginTop: '4px' }}>
          Settlement tx ↗
        </a>
      )}
      {error && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--crimson)', marginTop: '4px' }}>
          {error}
        </div>
      )}
    </div>
  )
}
