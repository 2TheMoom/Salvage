'use client'

import { useState, useEffect } from 'react'
import { useAccount, useSignMessage, useConnect } from 'wagmi'
import { injected } from '@wagmi/connectors'
import { contractScanLossTxHash } from '@/lib/contracts'
import { Chain, StrandedToken } from '@/types'

interface RegisterFindButtonProps {
  contractAddress: string
  tokens:          StrandedToken[]
  chain:           Chain
  triageStatus:    string
}

type FindState = 'idle' | 'signing' | 'registered' | 'taken' | 'error'

export default function RegisterFindButton({
  contractAddress,
  tokens,
  chain,
  triageStatus,
}: RegisterFindButtonProps) {
  const { address, isConnected } = useAccount()
  const { signMessageAsync }     = useSignMessage()
  const { connect }              = useConnect()

  const [state, setState]       = useState<FindState>('idle')
  const [msg, setMsg]           = useState<string | null>(null)
  const [jiggling, setJiggling] = useState(false)

  // A rejected connection attempt shouldn't just dead-end back to a disabled
  // button with no feedback — jiggle it so it's clear something needs retrying.
  const triggerJiggle = () => {
    setJiggling(true)
    setTimeout(() => setJiggling(false), 450)
  }

  // Contract-level discovery key: first finder of this stranded contract wins.
  const findKey = `${chain}:contract:${contractAddress.toLowerCase()}`

  // On mount, reflect whether this contract is already registered (by anyone).
  useEffect(() => {
    fetch(`/api/finds?findKey=${encodeURIComponent(findKey)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.find) {
          if (address && d.find.finder_address?.toLowerCase() === address.toLowerCase()) {
            setState('registered')
          } else {
            setState('taken')
            setMsg('Already registered by another finder.')
          }
        }
      })
      .catch(() => {})
  }, [findKey, address])

  if (triageStatus === 'unrecoverable') return null

  if (!isConnected) {
    return (
      <button
        className={`btn-reg ${jiggling ? 'jiggle' : ''}`}
        onClick={() => connect({ connector: injected() }, { onError: () => triggerJiggle() })}
      >
        Connect Wallet to Register
      </button>
    )
  }

  if (state === 'registered') {
    return (
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
        color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        ✓ Find registered — your finder priority is locked in.
      </div>
    )
  }

  if (state === 'taken') {
    return (
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--amber)',
      }}>
        {msg}
      </div>
    )
  }

  const handleRegister = async () => {
    if (!address) return
    setMsg(null)
    try {
      setState('signing')
      const primary = tokens[0]
      const symbolList = tokens.map((t) => t.tokenSymbol).filter(Boolean).join(', ') || 'stranded tokens'
      const message =
        `Salvage finder registration\n\n` +
        `I am registering a discovered stranded contract and agree to the finder fee schedule ` +
        `(7% finder, 3% protocol) on successful recovery.\n\n` +
        `Contract: ${contractAddress}\n` +
        `Tokens found: ${symbolList}\n` +
        `Chain: ${chain}\n` +
        `Finder: ${address}`

      const signature = await signMessageAsync({ message })

      const res = await fetch('/api/finds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain,
          victimWallet:      contractAddress,   // contract is the locus; no single victim
          tokenAddress:      primary.tokenAddress,
          tokenSymbol:       primary.tokenSymbol,
          strandedTokens:    tokens.map((t) => ({
            tokenAddress: t.tokenAddress,
            tokenSymbol:  t.tokenSymbol,
            valueUsd:     t.valueUsd,
          })),
          // Must match the same derived hash OwnerClaimPanel uses on-chain
          // for this contract — otherwise the off-chain find and the
          // eventual on-chain claim can never be cross-referenced to tell
          // a finder whether their registration actually got credited.
          lossTxHash:        contractScanLossTxHash(contractAddress),
          recipientContract: contractAddress,
          valueUsd:          tokens.reduce((s, t) => s + (t.valueUsd || 0), 0),
          finderAddress:     address,
          signature,
          message,
          findKeyOverride:   findKey,           // tell the API to use the contract-level key
        }),
      })
      const data = await res.json()

      if (data.success) {
        setState('registered')
      } else if (res.status === 409) {
        setState('taken')
        setMsg(data.error || 'Already registered by another finder.')
      } else {
        setState('error')
        setMsg(data.error || 'Registration failed.')
      }
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : ''
      setState('error')
      setMsg(m.includes('reject') || m.includes('denied') ? 'Signature rejected.' : 'Registration failed.')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <button
        className="btn-reg"
        onClick={handleRegister}
        disabled={state === 'signing'}
      >
        {state === 'signing' ? 'Check wallet…' : 'Register This Find'}
      </button>
      {state === 'error' && msg && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.67rem', color: 'var(--crimson)',
        }}>
          ✗ {msg}
        </div>
      )}
    </div>
  )
}