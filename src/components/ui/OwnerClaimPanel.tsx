'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  useAccount, useSignTypedData, useWriteContract, useReadContract, useSwitchChain,
} from 'wagmi'
import { keccak256, encodeAbiParameters, zeroAddress } from 'viem'
import {
  RECOVERY_ROUTER_ADDRESS, ROUTER_ABI, ROUTER_EIP712_TYPES,
  routerDomain, USDC_ABI, contractScanLossTxHash,
} from '@/lib/contracts'
import { Chain, StrandedToken } from '@/types'

const CHAIN_IDS: Record<Chain, number> = { eth: 1, base: 8453 }

interface OwnerClaimPanelProps {
  contractAddress: string
  chain: Chain
  ownerAddress: string
  tokens: StrandedToken[]
}

// Shown only to the wallet matching the contract's on-chain owner() — the
// only address that can actually execute a rescue call on this contract,
// so it's the only one a claim here can ever be fulfilled for. Registering
// as anyone else produces a claim that can never be funded; the router
// doesn't need to enforce that on-chain (same "front-running is harmless"
// logic as everywhere else in this contract), so the gate lives here.
export default function OwnerClaimPanel({ contractAddress, chain, ownerAddress, tokens }: OwnerClaimPanelProps) {
  const { address, isConnected } = useAccount()
  const isOwner = isConnected && address?.toLowerCase() === ownerAddress.toLowerCase()

  const [registeredFinder, setRegisteredFinder] = useState<string | null>(null)

  useEffect(() => {
    if (!isOwner) return
    const findKey = `${chain}:contract:${contractAddress.toLowerCase()}`
    fetch(`/api/finds?findKey=${encodeURIComponent(findKey)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.find) {
          const finder = d.find.finder_address as string | undefined
          if (finder && finder.toLowerCase() !== ownerAddress.toLowerCase()) {
            setRegisteredFinder(finder)
          }
        }
      })
      .catch(() => {})
  }, [chain, contractAddress, ownerAddress, isOwner])

  if (!isOwner || tokens.length === 0) return null

  const hasFinder = !!registeredFinder

  return (
    <div style={{
      marginTop: '12px', padding: '14px',
      borderRadius: '8px', background: 'var(--card)',
      border: '1px solid var(--eth-border)',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--eth)', marginBottom: '4px',
      }}>
        Contract Owner — Recover Stranded Tokens
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.64rem',
        color: 'var(--text-2)', lineHeight: 1.7, marginBottom: '10px',
      }}>
        {hasFinder
          ? 'A finder registered this contract first. Recovery routes 90% to you, 7% to them, 3% to the protocol.'
          : 'No finder has registered this contract. Recovery routes 95% to you, 5% to the protocol.'}
      </div>
      {tokens.map((token) => (
        <OwnerClaimRow
          key={token.tokenAddress}
          contractAddress={contractAddress}
          chain={chain}
          ownerAddress={ownerAddress}
          finderAddress={registeredFinder}
          token={token}
        />
      ))}
    </div>
  )
}

interface OwnerClaimRowProps {
  contractAddress: string
  chain: Chain
  ownerAddress: string
  finderAddress: string | null
  token: StrandedToken
}

type RowState = 'idle' | 'signing' | 'registering' | 'registered' | 'settling' | 'settled' | 'error'

function OwnerClaimRow({ contractAddress, chain, ownerAddress, finderAddress, token }: OwnerClaimRowProps) {
  const chainId = CHAIN_IDS[chain]
  const routerAddress = RECOVERY_ROUTER_ADDRESS[chainId]

  const { switchChainAsync }   = useSwitchChain()
  const { signTypedDataAsync } = useSignTypedData()
  const { writeContractAsync } = useWriteContract()

  const [state, setState]           = useState<RowState>('idle')
  const [errorMsg, setErrorMsg]     = useState<string | null>(null)
  const [registerTx, setRegisterTx] = useState<string | null>(null)
  const [settleTx, setSettleTx]     = useState<string | null>(null)
  const [copied, setCopied]         = useState(false)

  const finderForClaim = (finderAddress ?? zeroAddress) as `0x${string}`
  const hasFinder = finderForClaim !== zeroAddress
  const lossTxHash = useMemo(() => contractScanLossTxHash(contractAddress), [contractAddress])

  const claimId = useMemo(() => {
    try {
      return keccak256(encodeAbiParameters(
        [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'bytes32' }],
        [
          token.tokenAddress as `0x${string}`,
          ownerAddress as `0x${string}`,
          finderForClaim,
          lossTxHash,
        ]
      ))
    } catch { return undefined }
  }, [token.tokenAddress, ownerAddress, finderForClaim, lossTxHash])

  const { data: existingClaim, refetch: refetchClaim } = useReadContract({
    address: routerAddress,
    abi: ROUTER_ABI,
    functionName: 'claims',
    args: claimId ? [claimId] : undefined,
    chainId,
    query: { enabled: !!claimId },
  })
  const alreadyRegistered = existingClaim && existingClaim[1] !== zeroAddress
  const alreadySettledOnChain = !!existingClaim && (existingClaim[5] as bigint) > 0n
  const isSettled = alreadySettledOnChain || state === 'settled'
  const isRegistered = alreadyRegistered || state === 'registered' || state === 'settled'

  const { data: receiver } = useReadContract({
    address: routerAddress,
    abi: ROUTER_ABI,
    functionName: 'claimReceiver',
    args: claimId ? [claimId] : undefined,
    chainId,
    query: { enabled: !!claimId },
  })

  const { data: receiverBalance, refetch: refetchBalance } = useReadContract({
    address: token.tokenAddress as `0x${string}`,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: receiver ? [receiver] : undefined,
    chainId,
    query: { enabled: !!receiver && (!!alreadyRegistered || state === 'registered' || state === 'settled') },
  })
  const funded = (receiverBalance ?? 0n) > 0n

  const handleRegister = async () => {
    if (!claimId) return
    setErrorMsg(null)
    try {
      await switchChainAsync({ chainId }).catch(() => {})
      setState('signing')
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)
      const signature = await signTypedDataAsync({
        domain: routerDomain(chainId),
        types: ROUTER_EIP712_TYPES,
        primaryType: 'RecoveryClaim',
        message: {
          token:      token.tokenAddress as `0x${string}`,
          victim:     ownerAddress as `0x${string}`,
          finder:     finderForClaim,
          lossTxHash,
          deadline,
        },
      })

      setState('registering')
      const txHash = await writeContractAsync({
        address: routerAddress,
        abi: ROUTER_ABI,
        functionName: 'registerClaim',
        args: [
          token.tokenAddress as `0x${string}`,
          ownerAddress as `0x${string}`,
          finderForClaim,
          lossTxHash,
          deadline,
          signature,
        ],
        chainId,
      })

      fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimId, chain,
          tokenAddress:    token.tokenAddress,
          tokenSymbol:     token.tokenSymbol,
          victimAddress:   ownerAddress,
          finderAddress:   hasFinder ? finderForClaim : null,
          lossTxHash,
          receiverAddress: receiver,
          valueUsd:        token.valueUsd,
          registerTx:      txHash,
        }),
      }).catch(() => {})

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
      fetch('/api/claims', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId, status: 'settled', settleTx: settleHash }),
      }).catch(() => {})
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

  const copyReceiverInstructions = async () => {
    if (!receiver) return
    const chainName = chain === 'eth' ? 'Ethereum' : 'Base'
    const explorer  = chain === 'eth' ? 'etherscan.io' : 'basescan.org'
    const text = `Recovery deposit address (Salvage claim ${claimId?.slice(0, 10)}…):

${receiver}

Call your contract's rescue function to send the stranded ${token.tokenSymbol} to this exact address on ${chainName}. Settlement is automatic and fully on-chain — ${hasFinder ? '90% to you, 7% to the finder, 3% to the protocol' : '95% to you, 5% to the protocol'}.

Verify the settlement contract yourself: https://${explorer}/address/${routerAddress}#code`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  const btnStyle = {
    padding: '6px 11px', borderRadius: '6px',
    border: '1px solid var(--border)', cursor: 'pointer',
    fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
  } as const

  return (
    <div style={{
      padding: '10px', marginTop: '8px', borderRadius: '6px',
      background: 'var(--card-inner)', border: '1px solid var(--border)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600,
        color: 'var(--text)', marginBottom: '6px',
      }}>
        <span>{token.tokenSymbol}</span>
        <span>${token.valueUsd.toFixed(2)}</span>
      </div>

      {isSettled ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: 'var(--green)' }}>
          ✓ Settled on-chain.
        </div>
      ) : isRegistered ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: 'var(--text-2)', lineHeight: 1.7 }}>
          <div style={{
            padding: '6px 8px', margin: '4px 0', borderRadius: '4px',
            background: 'var(--card)', border: '1px solid var(--border)',
            color: 'var(--text)', wordBreak: 'break-all',
          }}>
            {receiver}
          </div>
          <div style={{ marginBottom: '6px' }}>
            {funded
              ? <span style={{ color: 'var(--green)' }}>● Funded — ready to settle</span>
              : `Call your rescue function to send ${token.tokenSymbol} here.`}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button onClick={copyReceiverInstructions} style={{ ...btnStyle, background: 'var(--card)', color: 'var(--text)' }}>
              {copied ? '✓ Copied' : 'Copy Instructions'}
            </button>
            {funded && (
              <button onClick={handleSettle} disabled={state === 'settling'}
                style={{ ...btnStyle, background: 'var(--green)', color: '#fff', border: 'none' }}>
                {state === 'settling' ? 'Settling…' : 'Settle'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <button onClick={handleRegister} disabled={state === 'signing' || state === 'registering'}
          style={{ ...btnStyle, background: 'var(--eth)', color: '#fff', border: 'none' }}>
          {state === 'signing'      ? 'Sign in your wallet…'
          : state === 'registering' ? 'Registering…'
          : 'Register & Recover'}
        </button>
      )}

      {(registerTx || settleTx) && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
          {registerTx && (
            <a href={`${chain === 'eth' ? 'https://etherscan.io' : 'https://basescan.org'}/tx/${registerTx}`}
               target="_blank" rel="noopener noreferrer"
               style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--eth)' }}>
              Registration tx ↗
            </a>
          )}
          {settleTx && (
            <a href={`${chain === 'eth' ? 'https://etherscan.io' : 'https://basescan.org'}/tx/${settleTx}`}
               target="_blank" rel="noopener noreferrer"
               style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--eth)' }}>
              Settlement tx ↗
            </a>
          )}
        </div>
      )}

      {errorMsg && (
        <div style={{ marginTop: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--crimson)' }}>
          {errorMsg}
        </div>
      )}
    </div>
  )
}
