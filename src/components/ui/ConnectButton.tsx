'use client'

import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi'
import { injected, coinbaseWallet, walletConnect } from '@wagmi/connectors'
import { useState, useEffect } from 'react'

const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

const FOUNDER_ADDRESS = (
  process.env.NEXT_PUBLIC_FOUNDER_ADDRESS || ''
).toLowerCase()

// Message the user signs to prove wallet ownership
const SIGN_MESSAGE = `Welcome to Salvage.\n\nSign this message to verify wallet ownership.\n\nThis request will not trigger a blockchain transaction or cost any gas.\n\nTimestamp: ${Math.floor(Date.now() / 60000)}` // changes every minute

interface ConnectButtonProps {
  onWalletChange?: (address: string | null) => void
  variant?: 'landing' | 'dashboard'
}

export default function ConnectButton({
  onWalletChange,
  variant = 'dashboard',
}: ConnectButtonProps) {
  const { address, isConnected }          = useAccount()
  const { connect, isPending }            = useConnect()
  const { disconnect }                    = useDisconnect()
  const { signMessage, isPending: signing } = useSignMessage()

  const [showMenu,      setShowMenu]      = useState(false)
  const [verified,      setVerified]      = useState(false)
  const [verifying,     setVerifying]     = useState(false)
  const [signError,     setSignError]     = useState<string | null>(null)
  const [jiggling,      setJiggling]      = useState(false)
  // How fast wagmi's internal isConnected flips to false after disconnect()
  // varies by connector (near-instant for injected/Coinbase, a relay round-trip
  // for WalletConnect) and isn't something we can reliably wait on. So once the
  // user disconnects, this flag pins the UI to the idle state regardless of
  // isConnected's timing, and only clears when they explicitly start a new
  // connection — never automatically, since resetting it off any async signal
  // (isConnected changing, disconnect()'s promise settling) reopens the same
  // race that caused the "stuck on Requesting Signature" bug in the first place.
  const [disconnecting, setDisconnecting] = useState(false)

  const handleDisconnect = () => {
    setShowMenu(false)
    setVerified(false)
    setSignError(null)
    setDisconnecting(true)
    disconnect()
  }

  // A rejected/failed connection attempt shouldn't dead-end silently —
  // jiggle the button so it's obvious something needs retrying, instead of
  // just reverting back to "Connect Wallet" with no feedback at all.
  const triggerJiggle = () => {
    setJiggling(true)
    setTimeout(() => setJiggling(false), 450)
  }

  const isFounder = address
    ? address.toLowerCase() === FOUNDER_ADDRESS
    : false

  // Restore verification from localStorage (7-day validity) — a refresh or
  // landing↔dashboard navigation must never demand a fresh signature.
  useEffect(() => {
    setSignError(null)
    // Skip while a disconnect is pinned — some wallets (MetaMask's injected
    // provider in particular) can report isConnected/address as still set for
    // a moment after disconnect() is called, and auto-triggering a fresh sign
    // request in that window is exactly the stuck-UI bug this flag exists to prevent.
    if (disconnecting) return
    if (isConnected && address) {
      const key   = `salvage_verified_${address.toLowerCase()}`
      const saved = typeof window !== 'undefined' ? localStorage.getItem(key) : null
      if (saved && Date.now() - parseInt(saved, 10) < 7 * 24 * 60 * 60 * 1000) {
        setVerified(true)
        return
      }
      setVerified(false)
      // Auto-trigger sign on first connect only
      handleSign()
    } else {
      setVerified(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected, disconnecting])

  // Notify parent
  useEffect(() => {
    if (onWalletChange) {
      onWalletChange(isConnected && address && verified ? address : null)
    }
  }, [isConnected, address, verified, onWalletChange])

  const handleSign = () => {
    if (!address) return
    setVerifying(true)
    setSignError(null)

    signMessage(
      { message: SIGN_MESSAGE },
      {
        onSuccess: () => {
          setVerified(true)
          setVerifying(false)
          if (address) {
            localStorage.setItem(
              `salvage_verified_${address.toLowerCase()}`,
              Date.now().toString()
            )
          }
        },
        onError: (err) => {
          setVerifying(false)
          setSignError(
            err.message.includes('rejected') || err.message.includes('denied')
              ? 'Signature rejected. Please sign to verify ownership.'
              : 'Signature failed. Please try again.'
          )
        },
      }
    )
  }

  const truncated = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null

  // ── Connected + verified
  if (!disconnecting && isConnected && address && verified) {
    return (
      <div style={{ position: 'relative' }}>
        <div
          className={`wallet-chip ${isFounder ? 'founder' : ''}`}
          onClick={() => setShowMenu(m => !m)}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          <span className="w-dot" />
          <span>{truncated}</span>
          {isFounder && (
            <span style={{ fontSize: '0.7rem', marginLeft: '2px' }}>👑</span>
          )}
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
            color: isFounder ? 'var(--eth)' : 'rgba(255,255,255,0.3)',
            marginLeft: '4px',
          }}>▾</span>
        </div>

        {showMenu && (
          <>
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              background: 'var(--dark-card)',
              border: '1px solid var(--dark-border)',
              borderRadius: '10px', padding: '6px',
              minWidth: '200px', zIndex: 200,
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.63rem',
                color: 'rgba(255,255,255,0.35)',
                padding: '8px 10px 4px',
              }}>
                {address.slice(0, 12)}…{address.slice(-6)}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
                color: 'var(--green)', padding: '0 10px 8px',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}>
                <span>✓</span> Ownership verified
              </div>
              <div style={{ height: '1px', background: 'var(--dark-border)', margin: '2px 0 4px' }} />
              {isFounder && (
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                  color: 'var(--eth)', padding: '6px 10px',
                }}>
                  👑 Founder wallet
                </div>
              )}
              <button
                onClick={handleDisconnect}
                style={{
                  width: '100%', textAlign: 'left',
                  fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                  color: 'var(--crimson)',
                  background: 'transparent', border: 'none',
                  padding: '8px 10px', borderRadius: '6px',
                  cursor: 'pointer', transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(176,28,46,0.12)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                Disconnect
              </button>
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

  // ── Connected but awaiting signature
  if (!disconnecting && isConnected && address && !verified) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {signError ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.67rem',
              color: 'var(--crimson)',
            }}>
              {signError}
            </span>
            <button
              className="btn-connect-d"
              onClick={handleSign}
              disabled={verifying}
              style={{ whiteSpace: 'nowrap' }}
            >
              Sign Again
            </button>
            <button
              onClick={handleDisconnect}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.67rem',
                color: 'rgba(255,255,255,0.35)', background: 'transparent',
                border: 'none', cursor: 'pointer', padding: '4px',
              }}
            >
              ✗
            </button>
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
            color: 'rgba(255,255,255,0.5)',
          }}>
            <span style={{
              width: '14px', height: '14px', border: '2px solid var(--eth)',
              borderTopColor: 'transparent', borderRadius: '50%',
              display: 'inline-block', animation: 'spin 0.8s linear infinite',
            }} />
            {verifying || signing ? 'Check your wallet…' : 'Requesting signature…'}
          </div>
        )}
      </div>
    )
  }

  // ── Disconnected — wallet picker
  if (showMenu) {
    return (
      <div style={{ position: 'relative' }}>
        <button
          className={variant === 'landing' ? 'btn-nav-primary' : 'btn-connect-d'}
          onClick={() => setShowMenu(false)}
        >
          Connect Wallet
        </button>
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          background: 'var(--dark-card)',
          border: '1px solid var(--dark-border)',
          borderRadius: '10px', padding: '6px',
          minWidth: '200px', zIndex: 200,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
            color: 'rgba(255,255,255,0.35)',
            padding: '8px 10px 6px', letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Choose Wallet
          </div>
          <div style={{ height: '1px', background: 'var(--dark-border)', margin: '4px 0' }} />

          <button
            onClick={() => {
              setDisconnecting(false)
              connect({ connector: injected() }, { onError: () => triggerJiggle() })
              setShowMenu(false)
            }}
            disabled={isPending}
            style={{
              width: '100%', textAlign: 'left',
              fontFamily: 'var(--font-body)', fontSize: '0.82rem',
              color: 'rgba(255,255,255,0.8)',
              background: 'transparent', border: 'none',
              padding: '10px', borderRadius: '6px',
              cursor: 'pointer', transition: 'background 0.15s',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <img src="/wallet-icons/metamask.svg" alt="" width={18} height={18} /> MetaMask
          </button>

          <button
            onClick={() => {
              setDisconnecting(false)
              connect(
                { connector: coinbaseWallet({ appName: 'Salvage' }) },
                { onError: () => triggerJiggle() }
              )
              setShowMenu(false)
            }}
            disabled={isPending}
            style={{
              width: '100%', textAlign: 'left',
              fontFamily: 'var(--font-body)', fontSize: '0.82rem',
              color: 'rgba(255,255,255,0.8)',
              background: 'transparent', border: 'none',
              padding: '10px', borderRadius: '6px',
              cursor: 'pointer', transition: 'background 0.15s',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <img src="/wallet-icons/coinbase.svg" alt="" width={18} height={18} /> Coinbase Wallet
          </button>

          {WALLETCONNECT_PROJECT_ID && (
            <button
              onClick={() => {
                setDisconnecting(false)
                connect(
                  {
                    connector: walletConnect({
                      projectId: WALLETCONNECT_PROJECT_ID,
                      metadata: {
                        name: 'Salvage',
                        description: 'Recover ERC-20 tokens stranded in smart contracts',
                        url: 'https://usesalvage.xyz',
                        icons: ['https://usesalvage.xyz/icon-512.png'],
                      },
                      showQrModal: true,
                    }),
                  },
                  { onError: () => triggerJiggle() }
                )
                setShowMenu(false)
              }}
              disabled={isPending}
              style={{
                width: '100%', textAlign: 'left',
                fontFamily: 'var(--font-body)', fontSize: '0.82rem',
                color: 'rgba(255,255,255,0.8)',
                background: 'transparent', border: 'none',
                padding: '10px', borderRadius: '6px',
                cursor: 'pointer', transition: 'background 0.15s',
                display: 'flex', alignItems: 'center', gap: '10px',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <img src="/wallet-icons/walletconnect.svg" alt="" width={18} height={18} /> WalletConnect
            </button>
          )}
        </div>
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 199 }}
          onClick={() => setShowMenu(false)}
        />
      </div>
    )
  }

  return (
    <button
      className={`${variant === 'landing' ? 'btn-nav-primary' : 'btn-connect-d'} ${jiggling ? 'jiggle' : ''}`}
      onClick={() => setShowMenu(true)}
      disabled={isPending}
    >
      {isPending ? 'Connecting…' : 'Connect Wallet'}
    </button>
  )
}