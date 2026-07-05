'use client'

import { useState, useEffect } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { Chain } from '@/types'

interface RegisterFindButtonProps {
  contractAddress: string
  tokenAddress:    string
  chain:           Chain
  triageStatus:    string
}

type FindState = 'idle' | 'signing' | 'registered' | 'taken' | 'error'

export default function RegisterFindButton({
  contractAddress,
  tokenAddress,
  chain,
  triageStatus,
}: RegisterFindButtonProps) {
  const { address, isConnected } = useAccount()
  const { signMessageAsync }     = useSignMessage()

  const [state, setState] = useState<FindState>('idle')
  const [msg, setMsg]     = useState<string | null>(null)

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
      <button className="btn-reg" style={{ opacity: 0.5, cursor: 'not-allowed' }} disabled>
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
      const token = tokenAddress || '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
      const message =
        `Salvage finder registration\n\n` +
        `I am registering a discovered stranded contract and agree to the finder fee schedule ` +
        `(7% finder, 3% protocol) on successful recovery.\n\n` +
        `Contract: ${contractAddress}\n` +
        `Token: ${token}\n` +
        `Chain: ${chain}\n` +
        `Finder: ${address}`

      const signature = await signMessageAsync({ message })

      const res = await fetch('/api/finds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain,
          victimWallet:      contractAddress,   // contract is the locus; no single victim
          tokenAddress:      token,
          tokenSymbol:       null,
          lossTxHash:        'contract-scan',   // sentinel: contract-level find
          recipientContract: contractAddress,
          valueUsd:          null,
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