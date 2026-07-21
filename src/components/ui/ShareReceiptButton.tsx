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
  label?: string
}

// Permanent, idempotent — the same URL renders the same receipt image every
// time (nothing to "regenerate" separately; a settled find's numbers never
// change), so this can sit on a row indefinitely rather than being a
// one-shot popup that can be missed.
export default function ShareReceiptButton({
  type, findKey, chain, lossTxHash, recipientContract, token, perspective, label,
}: ShareReceiptButtonProps) {
  const [copied, setCopied] = useState(false)

  const params = new URLSearchParams()
  if (findKey) params.set('findKey', findKey)
  if (chain) params.set('chain', chain)
  if (lossTxHash) params.set('lossTxHash', lossTxHash)
  if (recipientContract) params.set('recipientContract', recipientContract)
  if (token) params.set('token', token)
  if (perspective) params.set('perspective', perspective)
  const path = `/api/receipt/${type}?${params.toString()}`

  const handleShare = async () => {
    const url = `${window.location.origin}${path}`
    if (navigator.share) {
      try {
        await navigator.share({ url, title: 'Salvage' })
        return
      } catch {
        // user cancelled the share sheet, or share failed — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <button
      onClick={handleShare}
      style={{
        padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)',
        background: 'var(--card)', color: 'var(--text)', cursor: 'pointer',
        fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {copied ? '✓ Link copied' : (label || '↗ Share')}
    </button>
  )
}
