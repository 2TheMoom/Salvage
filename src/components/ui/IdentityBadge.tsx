'use client'

import { useIdentity } from '@/lib/useIdentity'
import { truncateAddress } from '@/lib/utils'

interface IdentityBadgeProps {
  address: string
  // Off by default — this renders a wider pill than fits in the compact
  // metric tiles, so only the dedicated owner-identity row opts in.
  showFarcasterLink?: boolean
}

// Renders exactly what's on screen today (a truncated address) until/unless
// something resolves — never a spinner, never a layout shift on the common
// "nothing resolved" case.
export default function IdentityBadge({ address, showFarcasterLink = false }: IdentityBadgeProps) {
  const { identity } = useIdentity(address)

  // Basename preferred over ENS when both resolve — the app is Base-first.
  const name = identity?.basename?.name || identity?.ens?.name
  const nameHref = identity?.basename
    ? `https://www.base.org/name/${identity.basename.name}`
    : identity?.ens
      ? `https://app.ens.domains/${identity.ens.name}`
      : undefined

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      {name && nameHref ? (
        <a
          href={nameHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px dotted currentColor' }}
        >
          {name}
        </a>
      ) : (
        truncateAddress(address)
      )}
      {showFarcasterLink && identity?.farcaster && (
        // Links to the profile, not a prefilled DM — Warpcast's public
        // compose intent only creates casts, there's no documented deep
        // link straight into a direct message.
        <a
          className="chip-link"
          href={`https://warpcast.com/${identity.farcaster.username}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          @{identity.farcaster.username} on Farcaster ↗
        </a>
      )}
    </span>
  )
}
