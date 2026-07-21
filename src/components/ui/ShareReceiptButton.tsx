'use client'

import { useState } from 'react'

interface ShareReceiptButtonProps {
  type: 'find' | 'settle'
  // Finder-flow identity — always available from FinderFindCard.
  findKey?: string
  // Direct claim identity — for victim-initiated settlements
  // (RecoveryClaimPanel/OwnerClaimPanel), which never create a
  // salvage_finds row at all (finder = address(0)), so there's no findKey.
  chain?: string
  lossTxHash?: string
  recipientContract?: string
  token?: string
  perspective?: 'finder' | 'victim'
  // The dollar figure the caller is already displaying — stranded value for
  // type=find, the actual payout for type=settle. Passed through rather than
  // re-derived here so this stays a pure display/share widget, not another
  // place that queries Supabase.
  amountUsd: number
  label?: string
}

// Matches the 7% approximation used everywhere else (FinderFindCard,
// /finds, src/lib/outreach.ts, src/lib/sweeper.ts).
const FINDER_FEE_RATE = 0.07

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(2)}`
}

// First-person — this is pre-filled into the *poster's own* post about
// their own win, so it needs to read as something a person would actually
// say about themselves, not a system notification addressed at them.
function buildShareText(type: 'find' | 'settle', perspective: ShareReceiptButtonProps['perspective'], amountUsd: number): string {
  if (type === 'find') {
    const earn = amountUsd * FINDER_FEE_RATE
    return `I just registered a find on Salvage — ${formatUsd(amountUsd)} stranded, could earn ${formatUsd(earn)} 🔍`
  }
  return perspective === 'finder'
    ? `I just earned ${formatUsd(amountUsd)} on Salvage from a stranded token recovery ✅`
    : `I just recovered ${formatUsd(amountUsd)} in stranded tokens with Salvage ✅`
}

// Permanent, idempotent — the same URL renders the same receipt image every
// time (nothing to "regenerate" separately; a settled find's numbers never
// change), so this can sit on a row indefinitely rather than being a
// one-shot popup that can be missed.
export default function ShareReceiptButton({
  type, findKey, chain, lossTxHash, recipientContract, token, perspective, amountUsd, label,
}: ShareReceiptButtonProps) {
  const [open, setOpen] = useState(false)
  const [copyState, setCopyState] = useState<'copying' | 'copied' | 'unsupported'>('copying')

  const params = new URLSearchParams()
  if (findKey) params.set('findKey', findKey)
  if (chain) params.set('chain', chain)
  if (lossTxHash) params.set('lossTxHash', lossTxHash)
  if (recipientContract) params.set('recipientContract', recipientContract)
  if (token) params.set('token', token)
  if (perspective) params.set('perspective', perspective)
  const query = params.toString()
  const imageUrl = `/api/receipt/${type}?${query}`
  const pageUrl = typeof window !== 'undefined' ? `${window.location.origin}/receipt/${type}?${query}` : ''
  const shareText = buildShareText(type, perspective, amountUsd)

  const handleOpen = async () => {
    setOpen(true)
    setCopyState('copying')
    try {
      const res = await fetch(imageUrl)
      const blob = await res.blob()
      // eslint-disable-next-line no-undef -- ClipboardItem, DOM lib type
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      setCopyState('copied')
    } catch {
      // Image clipboard writes aren't supported everywhere (weaker support
      // in Firefox/Safari) — fall back to copying the link as plain text
      // rather than leaving the user with nothing copied at all.
      try {
        await navigator.clipboard.writeText(pageUrl)
        setCopyState('copied')
      } catch {
        setCopyState('unsupported')
      }
    }
  }

  const xShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(pageUrl)}`
  const farcasterShareUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(shareText)}&embeds[]=${encodeURIComponent(pageUrl)}`

  return (
    <>
      <button
        onClick={handleOpen}
        style={{
          padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)',
          background: 'var(--card)', color: 'var(--text)', cursor: 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {label || '↗ Share'}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(26,26,30,0.55)', padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg)', borderRadius: '14px', padding: '20px',
              maxWidth: '460px', width: '100%',
              display: 'flex', flexDirection: 'column', gap: '14px',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <img
              src={imageUrl} alt="Salvage receipt"
              style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--border-md)' }}
            />

            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-2)' }}>
              {copyState === 'copying' && 'Copying image to clipboard…'}
              {copyState === 'copied' && '✓ Image copied — paste it anywhere, or share directly:'}
              {copyState === 'unsupported' && 'Clipboard copy not supported on this browser — share directly:'}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <a
                href={xShareUrl} target="_blank" rel="noopener noreferrer"
                style={{
                  flex: 1, textAlign: 'center', padding: '10px', borderRadius: '8px',
                  background: '#000', color: '#fff', textDecoration: 'none',
                  fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700,
                }}
              >
                Share on X
              </a>
              <a
                href={farcasterShareUrl} target="_blank" rel="noopener noreferrer"
                style={{
                  flex: 1, textAlign: 'center', padding: '10px', borderRadius: '8px',
                  background: '#8A63D2', color: '#fff', textDecoration: 'none',
                  fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700,
                }}
              >
                Share on Farcaster
              </a>
            </div>

            <button
              onClick={() => setOpen(false)}
              style={{
                alignSelf: 'center', background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: '0.64rem',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
