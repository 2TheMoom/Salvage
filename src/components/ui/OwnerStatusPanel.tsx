'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useReadContract, useWriteContract, useSwitchChain } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { config } from '@/lib/wagmi'
import { RECOVERY_ROUTER_ADDRESS, ROUTER_ABI, USDC_ABI } from '@/lib/contracts'
import { Chain } from '@/types'

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

type FinderClaimStatus =
  | 'pending'
  | 'registered_for_you'
  | 'settled_for_you'
  | 'claimed_without_you'
  | 'settled_without_you'

interface FinderFind {
  findKey: string
  chain: string
  tokenSymbol: string | null
  valueUsd: number | null
  recipientContract: string
  createdAt: string
  claimStatus: FinderClaimStatus
  registerTx: string | null
  settleTx: string | null
}

const FINDER_STATUS_COPY: Record<FinderClaimStatus, { label: string; color: string }> = {
  pending:              { label: 'Priority locked — waiting on the victim/owner to register a claim', color: 'var(--text-2)' },
  registered_for_you:   { label: 'Claim registered — crediting you, awaiting settlement', color: 'var(--eth)' },
  settled_for_you:      { label: '✓ Settled — your 7% has been paid out', color: 'var(--green)' },
  claimed_without_you:  { label: 'A claim was registered without crediting you', color: 'var(--crimson)' },
  settled_without_you:  { label: 'Settled without crediting you', color: 'var(--crimson)' },
}

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

      {finderFinds.map((find) => {
        const statusCopy = FINDER_STATUS_COPY[find.claimStatus]
        const explorer = find.chain === 'eth' ? 'etherscan.io' : 'basescan.org'
        const txHash = find.settleTx || find.registerTx
        return (
          <div key={find.findKey} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '9px 0', borderBottom: '1px solid var(--border)', gap: '10px',
          }}>
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
                {find.tokenSymbol || 'tokens'} find
                {find.valueUsd != null && <span style={{ color: 'var(--text-2)', fontWeight: 400 }}> · ${find.valueUsd.toFixed(2)}</span>}
                <span style={{ color: 'var(--text-2)', fontWeight: 400 }}> · {find.recipientContract.slice(0, 6)}…{find.recipientContract.slice(-4)}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: statusCopy.color }}>
                {statusCopy.label}
              </div>
              {txHash && (
                <a href={`https://${explorer}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--eth)' }}>
                  View transaction ↗
                </a>
              )}
            </div>
            <Link
              href={`/find/${encodeURIComponent(find.findKey)}`}
              style={{
                padding: '7px 12px', borderRadius: '6px', whiteSpace: 'nowrap',
                background: 'var(--eth)', color: '#fff', textDecoration: 'none',
                fontFamily: 'var(--font-mono)', fontSize: '0.64rem', fontWeight: 600,
              }}
            >
              View Find
            </Link>
          </div>
        )
      })}
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
        <a href={`https://${explorer}/tx/${settleTx}`} target="_blank" rel="noopener noreferrer"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--eth)' }}>
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
