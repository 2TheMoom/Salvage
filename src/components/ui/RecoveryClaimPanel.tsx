'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  useAccount, useSignTypedData, useSignMessage, useWriteContract,
  useReadContract, useSwitchChain,
} from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { keccak256, encodeAbiParameters, zeroAddress } from 'viem'
import { config } from '@/lib/wagmi'
import {
  RECOVERY_ROUTER_ADDRESS, ROUTER_ABI, ROUTER_EIP712_TYPES,
  routerDomain, USDC_ABI,
} from '@/lib/contracts'
import { VictimFinding, Chain } from '@/types'
import ShareReceiptButton from './ShareReceiptButton'

const CHAIN_IDS: Record<Chain, 1 | 8453> = { eth: 1, base: 8453 }

interface RecoveryClaimPanelProps {
  finding: VictimFinding
  victimWallet: string
  chain: Chain
}

type PanelState = 'idle' | 'signing' | 'registering' | 'registered' | 'settling' | 'settled' | 'error'

export default function RecoveryClaimPanel({ finding, victimWallet, chain }: RecoveryClaimPanelProps) {
  const chainId = CHAIN_IDS[chain]
  const routerAddress = RECOVERY_ROUTER_ADDRESS[chainId]

  const { address, isConnected } = useAccount()
  const { switchChainAsync }     = useSwitchChain()
  const { signTypedDataAsync }   = useSignTypedData()
  const { signMessageAsync }     = useSignMessage()

  const [findState, setFindState] = useState<'idle' | 'signing' | 'registered' | 'taken' | 'error'>('idle')
  const [findMsg, setFindMsg]     = useState<string | null>(null)
  const [registerTx, setRegisterTx] = useState<string | null>(null)
  const [settleTx, setSettleTx]     = useState<string | null>(null)

  // The off-chain-registered finder for this find, if any — this is what
  // actually gets threaded into the on-chain claim below. `null` until the
  // lookup resolves, which is treated as "no finder" (the common case).
  const [registeredFinder, setRegisteredFinder] = useState<string | null>(null)

  // On load, check whether this find is already registered (by anyone).
  // Registration lives in the DB, not local state, so a fresh scan must
  // re-derive it — otherwise the panel wrongly shows "Register This Find".
  useEffect(() => {
    const findKey = `${chain}:${finding.tokenAddress.toLowerCase()}:${finding.txHash.toLowerCase()}`
    fetch(`/api/finds?findKey=${encodeURIComponent(findKey)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.find) {
          const registered = d.find.finder_address as string | undefined
          // Defensive: the API rejects finder === victim on write, but never
          // trust a stored value blindly — a finder equal to the victim can
          // never settle on-chain (the router reverts), so treat it as none.
          if (registered && registered.toLowerCase() !== victimWallet.toLowerCase()) {
            setRegisteredFinder(registered)
          }
          if (address && registered?.toLowerCase() === address.toLowerCase()) {
            setFindState('registered')
          } else {
            setFindState('taken')
            setFindMsg('This find is already registered by another finder.')
          }
        }
      })
      .catch(() => {})
  }, [chain, finding.tokenAddress, finding.txHash, address, victimWallet])

  // Finder registration — off-chain, locks in the 7% finder priority
  // with a signed agreement. No victim signature needed at this stage.
  const handleRegisterFind = async () => {
    if (!address) return
    setFindMsg(null)
    try {
      setFindState('signing')
      const message =
        `Salvage finder registration\n\n` +
        `I am registering a discovered stranded find and agree to the finder fee schedule ` +
        `(7% finder, 3% protocol) on successful recovery.\n\n` +
        `Token: ${finding.tokenAddress}\n` +
        `Loss tx: ${finding.txHash}\n` +
        `Victim wallet: ${victimWallet}\n` +
        `Finder: ${address}`

      const signature = await signMessageAsync({ message })

      const res = await fetch('/api/finds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain,
          victimWallet,
          tokenAddress:      finding.tokenAddress,
          tokenSymbol:       finding.tokenSymbol,
          lossTxHash:        finding.txHash,
          recipientContract: finding.recipientContract,
          valueUsd:          finding.valueUsd,
          finderAddress:     address,
          signature,
          message,
        }),
      })
      const data = await res.json()
      if (data.success)       setFindState('registered')
      else if (res.status === 409) { setFindState('taken'); setFindMsg(data.error) }
      else                    { setFindState('error'); setFindMsg(data.error || 'Registration failed.') }
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : ''
      setFindState('error')
      setFindMsg(m.includes('reject') || m.includes('denied') ? 'Signature rejected.' : 'Registration failed.')
    }
  }

  const { writeContractAsync }   = useWriteContract()

  const [state, setState]       = useState<PanelState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copied, setCopied]     = useState(false)

  const isVictimWallet =
    isConnected && address?.toLowerCase() === victimWallet.toLowerCase()

  // The finder actually used on-chain: the registered finder if one exists,
  // otherwise zeroAddress (victim-initiated, 95/5). This is the single
  // source of truth for claimId, the EIP-712 signature, and registerClaim.
  const finderForClaim = (registeredFinder ?? zeroAddress) as `0x${string}`
  const hasFinder = finderForClaim !== zeroAddress

  // claimId is deterministic: keccak256(abi.encode(token, victim, finder, lossTxHash))
  const claimId = useMemo(() => {
    try {
      return keccak256(encodeAbiParameters(
        [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'bytes32' }],
        [
          finding.tokenAddress as `0x${string}`,
          victimWallet as `0x${string}`,
          finderForClaim,
          finding.txHash as `0x${string}`,
        ]
      ))
    } catch { return undefined }
  }, [finding.tokenAddress, finding.txHash, victimWallet, finderForClaim])

  // On-chain state: is this claim already registered?
  const { data: existingClaim, refetch: refetchClaim } = useReadContract({
    address: routerAddress,
    abi: ROUTER_ABI,
    functionName: 'claims',
    args: claimId ? [claimId] : undefined,
    chainId,
    query: { enabled: !!claimId },
  })
  const alreadyRegistered =
    existingClaim && existingClaim[1] !== zeroAddress

  // totalSettled is the 6th field of the Claim struct (index 5).
  // Non-zero means this claim has already been settled on-chain, so the
  // receiver being empty is "done", not "awaiting deposit".
  const alreadySettledOnChain =
    !!existingClaim && (existingClaim[5] as bigint) > 0n

  const isSettled = alreadySettledOnChain || state === 'settled'

  const { data: receiver } = useReadContract({
    address: routerAddress,
    abi: ROUTER_ABI,
    functionName: 'claimReceiver',
    args: claimId ? [claimId] : undefined,
    chainId,
    query: { enabled: !!claimId },
  })

  // Receiver funding status
  const { data: receiverBalance, refetch: refetchBalance } = useReadContract({
    address: finding.tokenAddress as `0x${string}`,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: receiver ? [receiver] : undefined,
    chainId,
    query: { enabled: !!receiver && (!!alreadyRegistered || state === 'registered' || state === 'settled') },
  })
  const funded = (receiverBalance ?? 0n) > 0n

  const handleStartRecovery = async () => {
    if (!isVictimWallet || !claimId) return
    setErrorMsg(null)
    try {
      await switchChainAsync({ chainId }).catch(() => {})

      // Deliberate, per-claim EIP-712 signature — separate from the
      // sign-in verification by design.
      setState('signing')
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)
      const signature = await signTypedDataAsync({
        domain: routerDomain(chainId),
        types: ROUTER_EIP712_TYPES,
        primaryType: 'RecoveryClaim',
        message: {
          token:      finding.tokenAddress as `0x${string}`,
          victim:     victimWallet as `0x${string}`,
          finder:     finderForClaim,
          lossTxHash: finding.txHash as `0x${string}`,
          deadline,
        },
      })

      setState('registering')
      const txHash = await writeContractAsync({
        address: routerAddress,
        abi: ROUTER_ABI,
        functionName: 'registerClaim',
        args: [
          finding.tokenAddress as `0x${string}`,
          victimWallet as `0x${string}`,
          finderForClaim,
          finding.txHash as `0x${string}`,
          deadline,
          signature,
        ],
        chainId,
      })

      // The API verifies the claim on-chain before recording it, so it won't
      // find anything until this tx actually confirms — wait for the receipt
      // first instead of firing right after the wallet merely broadcasts it.
      waitForTransactionReceipt(config, { hash: txHash, chainId })
        .then(() => fetch('/api/claims', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            claimId, chain,
            tokenSymbol: finding.tokenSymbol,
            valueUsd:    finding.valueUsd,
            registerTx:  txHash,
          }),
        }))
        .catch(() => {})

      setRegisterTx(txHash)
      setState('registered')
      refetchClaim()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      setErrorMsg(msg.includes('rejected') || msg.includes('denied')
        ? 'Signature or transaction rejected.'
        : 'Claim registration failed. Please try again.')
      setState('error')
    }
  }

  const handleSettle = async () => {
    if (!claimId) return
    setErrorMsg(null)
    try {
      await switchChainAsync({ chainId }).catch(() => {})
      setState('settling')
      const settleHash = await writeContractAsync({
        address: routerAddress,
        abi: ROUTER_ABI,
        functionName: 'settle',
        args: [claimId],
        chainId,
      })
      setSettleTx(settleHash)
      // Mark settled in the claims registry (non-blocking)
      waitForTransactionReceipt(config, { hash: settleHash, chainId })
        .then(() => fetch('/api/claims', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ claimId, settleTx: settleHash }),
        }))
        .catch(() => {})
      setState('settled')
      refetchBalance()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      setErrorMsg(msg.includes('rejected') || msg.includes('denied')
        ? 'Transaction rejected.'
        : msg.includes('nothing to settle')
          ? 'Nothing to settle yet — the receiver has no tokens.'
          : 'Settlement failed. Please try again.')
      setState('error')
    }
  }

  const copyOwnerInstructions = async () => {
    if (!receiver) return
    const chainName = chain === 'eth' ? 'Ethereum' : 'Base'
    const explorer  = chain === 'eth' ? 'etherscan.io' : 'basescan.org'
    const text = `Recovery deposit address (Salvage claim ${claimId?.slice(0, 10)}…):

${receiver}

Rescue the stranded ${finding.tokenSymbol} to this exact address on ${chainName}. Settlement is automatic and fully on-chain — ${hasFinder ? '90% routes to the verified victim, 7% to the finder, 3% to the protocol' : '95% routes to the verified victim, 5% to the protocol'}. You never have to trust a claimed wallet address.

Verify the settlement contract yourself: https://${explorer}/address/${RECOVERY_ROUTER_ADDRESS[chainId]}#code`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  const isRegistered = alreadyRegistered || state === 'registered' || state === 'settled'
  const btnStyle = {
    padding: '7px 12px', borderRadius: '6px',
    border: '1px solid var(--border)', cursor: 'pointer',
    fontFamily: 'var(--font-mono)', fontSize: '0.64rem', fontWeight: 600,
  } as const

  return (
    <div style={{
      marginTop: '10px', padding: '12px',
      borderRadius: '7px', background: 'var(--card)',
      border: '1px solid var(--border)',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--text-2)', marginBottom: '8px',
      }}>
        On-chain Recovery · {hasFinder ? '90% you / 7% finder / 3% protocol' : '95% you / 5% protocol'}
      </div>

      {/* ── Finder axis: off-chain discovery priority (salvage_finds) ──
          Independent of on-chain claim state. Only shown to non-victim
          wallets — it's about who found it, not about settlement. */}
      {isConnected && !isVictimWallet && (
        <div style={{ marginBottom: (isRegistered || isSettled) ? '12px' : '0' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.64rem',
            color: 'var(--text-2)', lineHeight: 1.7, marginBottom: '8px',
          }}>
            You&apos;re not the sender ({victimWallet.slice(0, 6)}…{victimWallet.slice(-4)}) —
            but you found this. Register the find to lock in your 7% finder priority before
            reaching out to them. First finder wins.
          </div>
          {findState === 'registered' ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--green)' }}>
              ✓ Find registered — your finder priority is locked in. Now reach the sender;
              when they sign the claim, your 7% routes automatically.
            </div>
          ) : findState === 'taken' ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--amber)' }}>
              {findMsg}
            </div>
          ) : (
            <button
              onClick={handleRegisterFind}
              disabled={findState === 'signing'}
              style={{ ...btnStyle, background: 'var(--eth)', color: '#fff', border: 'none' }}
            >
              {findState === 'signing' ? 'Sign the agreement in your wallet…' : 'Register This Find'}
            </button>
          )}
          {findMsg && findState === 'error' && (
            <div style={{ marginTop: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--crimson)' }}>
              {findMsg}
            </div>
          )}
        </div>
      )}

      {/* ── On-chain axis: the actual recovery. Not yet registered. ── */}
      {!isRegistered && (
        <>
          {!isConnected ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-2)' }}>
              Connect the wallet that sent this transfer to start recovery.
            </div>
          ) : isVictimWallet ? (
            <>
              {hasFinder && (
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                  color: 'var(--text-2)', lineHeight: 1.7, marginBottom: '8px',
                }}>
                  A finder ({finderForClaim.slice(0, 6)}…{finderForClaim.slice(-4)}) registered this
                  find first. Signing routes 90% to you, 7% to them, 3% to the protocol.
                </div>
              )}
              <button
                onClick={handleStartRecovery}
                disabled={state === 'signing' || state === 'registering'}
                style={{ ...btnStyle, background: 'var(--eth)', color: '#fff', border: 'none' }}
              >
                {state === 'signing'      ? 'Sign the claim in your wallet…'
                : state === 'registering' ? 'Registering on-chain…'
                : 'Start Recovery — Sign Claim'}
              </button>
            </>
          ) : (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: 'var(--text-3)', lineHeight: 1.7 }}>
              On-chain recovery is signed by the sender. Once they start it, this find settles automatically.
            </div>
          )}
        </>
      )}

      {/* ── On-chain axis: settled ── */}
      {isRegistered && isSettled && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', lineHeight: 1.8, color: 'var(--green)' }}>
          <div>✓ Recovery complete — this claim has been settled on-chain.</div>
          <div style={{ color: 'var(--text-2)', marginTop: '4px' }}>
            {hasFinder
              ? '90% routed to the victim, 7% to the finder, 3% to the protocol. Nothing further to do.'
              : '95% routed to the victim, 5% to the protocol. Nothing further to do.'}
          </div>
          <div style={{ marginTop: '8px' }}>
            <ShareReceiptButton
              type="settle" perspective="victim"
              chain={chain} token={finding.tokenAddress}
              lossTxHash={finding.txHash} recipientContract={finding.recipientContract}
              amountUsd={finding.valueUsd * (hasFinder ? 0.90 : 0.95)}
            />
          </div>
        </div>
      )}

      {/* ── On-chain axis: registered, awaiting deposit / ready to settle ──
          Settle is an owner/victim action. A non-victim finder sees status
          only — never a settle button (that was the reverting transaction). */}
      {isRegistered && !isSettled && receiver && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', lineHeight: 1.8, color: 'var(--text-2)' }}>
          <div>
            ✓ Claim registered on-chain. Recovery deposit address:
          </div>
          <div style={{
            padding: '7px 9px', margin: '5px 0', borderRadius: '5px',
            background: 'var(--card-inner)', border: '1px solid var(--border)',
            color: 'var(--text)', fontSize: '0.62rem', wordBreak: 'break-all',
          }}>
            {receiver}
          </div>
          <div style={{ marginBottom: '8px' }}>
            {funded
              ? <span style={{ color: 'var(--green)' }}>● Receiver funded — ready to settle</span>
              : 'Share this with the contract owner. Once they rescue the tokens here, anyone can settle.'}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={copyOwnerInstructions}
              style={{ ...btnStyle, background: 'var(--card-inner)', color: 'var(--text)' }}>
              {copied ? '✓ Copied' : 'Copy Owner Instructions'}
            </button>
            {funded && (
              <button
                onClick={handleSettle}
                disabled={state === 'settling'}
                style={{
                  ...btnStyle,
                  background: 'var(--green)', color: '#fff', border: 'none',
                }}
              >
                {state === 'settling' ? 'Settling…' : 'Settle Recovery'}
              </button>
            )}
          </div>
        </div>
      )}

      {(registerTx || settleTx) && (
        <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
          {registerTx && (
            <a href={`${chain === 'eth' ? 'https://etherscan.io' : 'https://basescan.org'}/tx/${registerTx}`}
               target="_blank" rel="noopener noreferrer"
               style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--eth)' }}>
              Registration tx ↗
            </a>
          )}
          {settleTx && (
            <a href={`${chain === 'eth' ? 'https://etherscan.io' : 'https://basescan.org'}/tx/${settleTx}`}
               target="_blank" rel="noopener noreferrer"
               style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--eth)' }}>
              Settlement tx ↗
            </a>
          )}
        </div>
      )}

      {state === 'settled' && (
        <div style={{
          marginTop: '8px', fontFamily: 'var(--font-mono)',
          fontSize: '0.66rem', color: 'var(--green)',
        }}>
          {hasFinder
            ? '✓ Recovery settled on-chain — 90% is in your wallet, 7% to your finder.'
            : '✓ Recovery settled on-chain — 95% is in your wallet.'}
        </div>
      )}

      {errorMsg && (
        <div style={{
          marginTop: '8px', fontFamily: 'var(--font-mono)',
          fontSize: '0.64rem', color: 'var(--crimson)',
        }}>
          {errorMsg}
        </div>
      )}
    </div>
  )
}