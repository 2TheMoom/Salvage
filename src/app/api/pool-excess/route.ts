import { NextRequest } from 'next/server'
import { corsJson, corsPreflight } from '@/lib/cors'
import { checkRateLimit } from '@/lib/ratelimit'
import { getReserves, getPoolExcessBalance } from '@/lib/pool'
import { getTokenMetadata, formatBalance } from '@/lib/sweeper'
import { isValidAddress } from '@/lib/utils'
import { Chain } from '@/types'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

// skim(address to) sweeps the excess of BOTH pool tokens, not just the one
// a claim is registered for — this is a live, pre-action disclosure check
// (same shape as /api/blacklist-check) so the UI can show the honest amount
// of the OTHER token before the button is ever clickable.
export async function GET(req: NextRequest) {
  try {
    const { limited } = await checkRateLimit(req, 'pool-excess')
    if (limited) {
      return corsJson(req, { success: false, error: 'Too many requests — please wait a moment.' }, { status: 429 })
    }

    const chain        = req.nextUrl.searchParams.get('chain') as Chain | null
    const pool          = req.nextUrl.searchParams.get('pool')
    const token0        = req.nextUrl.searchParams.get('token0')
    const token1        = req.nextUrl.searchParams.get('token1')
    const claimedToken  = req.nextUrl.searchParams.get('claimedToken')

    if (!chain || (chain !== 'eth' && chain !== 'base' && chain !== 'arc')) {
      return corsJson(req, { success: false, error: 'Invalid chain' }, { status: 400 })
    }
    if (!pool || !isValidAddress(pool) || !token0 || !isValidAddress(token0) ||
        !token1 || !isValidAddress(token1) || !claimedToken || !isValidAddress(claimedToken)) {
      return corsJson(req, { success: false, error: 'Invalid address in request' }, { status: 400 })
    }

    const claimedLower = claimedToken.toLowerCase()
    const otherToken = token0.toLowerCase() === claimedLower ? token1 : token0
    if (otherToken.toLowerCase() !== token0.toLowerCase() && otherToken.toLowerCase() !== token1.toLowerCase()) {
      return corsJson(req, { success: false, error: 'claimedToken is not one of this pool\'s two tokens' }, { status: 400 })
    }

    const { reserve0, reserve1 } = await getReserves(pool, chain)
    const otherReserve = otherToken.toLowerCase() === token0.toLowerCase() ? reserve0 : reserve1

    const [excess, meta] = await Promise.all([
      getPoolExcessBalance(pool, otherToken as `0x${string}`, otherReserve, chain),
      getTokenMetadata(otherToken, chain),
    ])

    return corsJson(req, {
      success: true,
      otherToken: {
        address:  otherToken.toLowerCase(),
        symbol:   meta?.symbol || '???',
        excess:   excess.toString(),
        excessFormatted: meta ? formatBalance(excess.toString(), meta.decimals) : excess.toString(),
      },
    })
  } catch (err) {
    console.error('[/api/pool-excess] error:', err)
    return corsJson(req, { success: false, error: 'Failed to check pool excess balance' }, { status: 500 })
  }
}
