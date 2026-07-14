'use client'

import { useState } from 'react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'

const NETWORKS = [
  { chainId: 1,    name: 'Ethereum', icon: '/chain-icons/ethereum.svg' },
  { chainId: 8453, name: 'Base',     icon: '/chain-icons/base.svg' },
] as const

// Lets a connected wallet switch networks proactively from the dashboard,
// instead of only discovering a mismatch mid-transaction — the claim panels
// still call switchChainAsync() themselves right before registering/settling
// as a safety net, but shouldn't be the first time a user sees it happen.
export default function ChainSwitcher() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending } = useSwitchChain()
  const [showMenu, setShowMenu] = useState(false)

  if (!isConnected) return null

  const current = NETWORKS.find((n) => n.chainId === chainId)

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowMenu((m) => !m)}
        disabled={isPending}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 10px', borderRadius: '20px',
          border: '1px solid var(--dark-border)', background: 'var(--dark-card)',
          cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
          fontWeight: 600, color: 'rgba(255,255,255,0.85)',
        }}
      >
        {current ? (
          <>
            <img src={current.icon} alt="" width={14} height={14} />
            {isPending ? 'Switching…' : current.name}
          </>
        ) : (
          <span style={{ color: 'var(--amber)' }}>Unsupported network</span>
        )}
        <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>▾</span>
      </button>

      {showMenu && (
        <>
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            background: 'var(--dark-card)', border: '1px solid var(--dark-border)',
            borderRadius: '10px', padding: '6px', minWidth: '160px', zIndex: 200,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}>
            {NETWORKS.map((n) => (
              <button
                key={n.chainId}
                onClick={() => { switchChain({ chainId: n.chainId }); setShowMenu(false) }}
                disabled={n.chainId === chainId}
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: '10px',
                  fontFamily: 'var(--font-body)', fontSize: '0.82rem',
                  color: n.chainId === chainId ? 'var(--eth)' : 'rgba(255,255,255,0.8)',
                  background: 'transparent', border: 'none',
                  padding: '10px', borderRadius: '6px',
                  cursor: n.chainId === chainId ? 'default' : 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { if (n.chainId !== chainId) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <img src={n.icon} alt="" width={18} height={18} />
                {n.name}
                {n.chainId === chainId && <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>✓</span>}
              </button>
            ))}
          </div>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 199 }}
            onClick={() => setShowMenu(false)}
          />
        </>
      )}
    </div>
  )
}
