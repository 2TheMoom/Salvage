'use client'

import { useEffect, useState } from 'react'
// Type-only import — must never pull identity.ts's server-side viem client
// (and its ALCHEMY_ETH_RPC read) into the client bundle.
import type { ResolvedIdentity } from '@/lib/identity'

// Plain fetch-on-mount, same convention as VictimResultCard's claims lookup —
// no react-query, it's only wired up for wagmi's internals in this app.
export function useIdentity(address?: string): { identity: ResolvedIdentity | null; loading: boolean } {
  const [identity, setIdentity] = useState<ResolvedIdentity | null>(null)
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    if (!address) {
      setIdentity(null)
      return
    }

    let cancelled = false
    setLoading(true)

    fetch(`/api/identity?address=${address}`)
      .then(r => r.json())
      .then(d => {
        if (!cancelled && d.success) setIdentity(d.identity)
      })
      .catch(() => { /* fail soft — card falls back to the raw address */ })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [address])

  return { identity, loading }
}
