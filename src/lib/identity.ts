import { createPublicClient, http, toCoinType } from 'viem'
import { mainnet, base } from 'viem/chains'

// A single mainnet client resolves BOTH ENS and Basenames — Basenames are
// registered via ENSIP-19 (L2 primary names), so the standard ENS Universal
// Resolver on mainnet handles the CCIP-read round trip itself when given the
// Base chain's coinType. No separate Base RPC/resolver contract needed.
const ensClient = createPublicClient({
  chain: mainnet,
  transport: http(process.env.ALCHEMY_ETH_RPC),
})

export interface ResolvedIdentity {
  ens?: { name: string; avatar?: string }
  basename?: { name: string }
  farcaster?: { fid: number; username: string; displayName?: string; pfpUrl?: string }
}

async function resolveEns(address: `0x${string}`): Promise<ResolvedIdentity['ens'] | undefined> {
  try {
    const name = await ensClient.getEnsName({ address })
    if (!name) return undefined
    const avatar = await ensClient.getEnsAvatar({ name }).catch(() => null)
    return { name, avatar: avatar ?? undefined }
  } catch {
    return undefined
  }
}

async function resolveBasename(address: `0x${string}`): Promise<ResolvedIdentity['basename'] | undefined> {
  try {
    const name = await ensClient.getEnsName({ address, coinType: toCoinType(base.id) })
    return name ? { name } : undefined
  } catch {
    return undefined
  }
}

async function resolveFarcaster(address: `0x${string}`): Promise<ResolvedIdentity['farcaster'] | undefined> {
  const apiKey = process.env.NEYNAR_API_KEY
  if (!apiKey) return undefined

  // Lowercase both the outgoing query param and the key used to read the
  // response back out — Neynar keys its response object by the address
  // exactly as sent, so any casing mismatch between the two silently drops
  // an otherwise-successful lookup.
  const lower = address.toLowerCase()

  try {
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${lower}`,
      { headers: { 'x-api-key': apiKey }, cache: 'no-store' }
    )
    if (!res.ok) return undefined

    const data = await res.json() as Record<string, Array<{
      fid: number; username: string; display_name?: string | null; pfp_url?: string | null
    }>>
    const user = data[lower]?.[0]
    if (!user) return undefined

    return {
      fid: user.fid,
      username: user.username,
      displayName: user.display_name ?? undefined,
      pfpUrl: user.pfp_url ?? undefined,
    }
  } catch {
    return undefined
  }
}

// Three independent lookups — one provider failing or timing out must never
// block the others, so each has its own try/catch and this fans out with
// allSettled rather than Promise.all.
export async function resolveIdentity(address: string): Promise<ResolvedIdentity> {
  const addr = address as `0x${string}`
  const [ens, basename, farcaster] = await Promise.allSettled([
    resolveEns(addr),
    resolveBasename(addr),
    resolveFarcaster(addr),
  ])

  return {
    ens:       ens.status === 'fulfilled' ? ens.value : undefined,
    basename:  basename.status === 'fulfilled' ? basename.value : undefined,
    farcaster: farcaster.status === 'fulfilled' ? farcaster.value : undefined,
  }
}
