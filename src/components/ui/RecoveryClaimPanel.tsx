'use client'

import { useState, useMemo } from 'react'
import {
  useAccount, useSignTypedData, useSignMessage, useWriteContract,
  useReadContract, useSwitchChain,
} from 'wagmi'
import { keccak256, encodeAbiParameters, zeroAddress } from 'viem'
import {
  RECOVERY_ROUTER_ADDRESS, ROUTER_ABI, ROUTER_EIP712_TYPES,
  routerDomain, USDC_ABI,
} from '@/lib/contracts'
import { VictimFinding, Chain } from '@/types'

const CHAIN_IDS: Record<Chain, number> = { eth: 1, base: 8453 }

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

  // claimId is deterministic: keccak256(abi.encode(token, victim, finder, lossTxHash))
  const claimId = useMemo(() => {
    try {
      return keccak256(encodeAbiParameters(
        [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'bytes32' }],
        [
          finding.tokenAddress as `0x${string}`,
          victimWallet as `0x${string}`,
          zeroAddress,
          finding.txHash as `0x${string}`,
        ]
      ))
    } catch { return undefined }
  }, [finding.tokenAddress, finding.txHash, victimWallet])

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
          finder:     zeroAddress,
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
          zeroAddress,
          finding.txHash as `0x${string}`,
          deadline,
          signature,
        ],
        chainId,
      })

      // Record in Salvage's claim registry (non-blocking for the user)
      fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimId, chain,
          tokenAddress:    finding.tokenAddress,
          tokenSymbol:     finding.tokenSymbol,
          victimAddress:   victimWallet,
          finderAddress:   null,
          lossTxHash:      finding.txHash,
          receiverAddress: receiver,
          valueUsd:        finding.valueUsd,
          registerTx:      txHash,
        }),
      }).catch(() => {})

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
      await writeContractAsync({
        address: routerAddress,
        abi: ROUTER_ABI,
        functionName: 'settle',
        args: [claimId],
        chainId,
      })
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

Rescue the stranded ${finding.tokenSymbol} to this exact address on ${chainName}. Settlement is automatic and fully on-chain — 95% routes to the verified victim, 5% to the protocol. You never have to trust a claimed wallet address.

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
        On-chain Recovery · 95% you / 5% protocol
      </div>

      {!isRegistered && (
        <>
          {!isConnected ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-2)' }}>
              Connect the wallet that sent this transfer to start recovery.
            </div>
          ) : !isVictimWallet ? (
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.64rem',
                color: 'var(--text-2)', lineHeight: 1.7, marginBottom: '8px',
              }}>
                You&apos;re not the sender ({victimWallet.slice(0, 6)}…{victimWallet.slice(-4)}) —
                but you found this. Register the find to lock in your 7% finder fee before
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
          ) : (
            <button
              onClick={handleStartRecovery}
              disabled={state === 'signing' || state === 'registering'}
              style={{ ...btnStyle, background: 'var(--eth)', color: '#fff', border: 'none' }}
            >
              {state === 'signing'     ? 'Sign the claim in your wallet…'
              : state === 'registering' ? 'Registering on-chain…'
              : 'Start Recovery — Sign Claim'}
            </button>
          )}
        </>
      )}

      {isRegistered && receiver && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', lineHeight: 1.8, color: 'var(--text-2)' }}>
          <div>
            ✓ Claim registered. Recovery deposit address:
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
            <button
              onClick={handleSettle}
              disabled={!funded || state === 'settling'}
              style={{
                ...btnStyle,
                background: funded ? 'var(--green)' : 'var(--card-inner)',
                color: funded ? '#fff' : 'var(--text-3)',
                border: funded ? 'none' : '1px solid var(--border)',
                cursor: funded ? 'pointer' : 'not-allowed',
              }}
            >
              {state === 'settling' ? 'Settling…'
              : state === 'settled' ? '✓ Settled'
              : 'Settle Recovery'}
            </button>
          </div>
        </div>
      )}

      {state === 'settled' && (
        <div style={{
          marginTop: '8px', fontFamily: 'var(--font-mono)',
          fontSize: '0.66rem', color: 'var(--green)',
        }}>
          ✓ Recovery settled on-chain — 95% is in your wallet.
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