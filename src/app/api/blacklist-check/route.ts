import { NextRequest } from 'next/server'
import { corsJson, corsPreflight } from '@/lib/cors'
import { checkRateLimit } from '@/lib/ratelimit'
import { checkBlacklist } from '@/lib/blacklist'
import { getProtocolFeeRecipient } from '@/lib/contracts'
import { isValidAddress } from '@/lib/utils'
import { Chain } from '@/types'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

// Checks whether the parties on a claim are blacklisted by the token's own
// issuer-side blacklist (USDC/USDT-style) before settle() is attempted —
// see src/lib/blacklist.ts for why this matters. Always checks the current
// on-chain protocolFeeRecipient too, in addition to whatever addresses the
// caller passes (victim, finder), since a caller has no way to know that
// address itself.
export async function GET(req: NextRequest) {
  try {
    const { limited } = await checkRateLimit(req, 'blacklist-check')
    if (limited) {
      return corsJson(req, { success: false, error: 'Too many requests — please wait a moment.' }, { status: 429 })
    }

    const chain = req.nextUrl.searchParams.get('chain') as Chain | null
    const token = req.nextUrl.searchParams.get('token')
    const addressesParam = req.nextUrl.searchParams.get('addresses')

    if (!chain || (chain !== 'eth' && chain !== 'base')) {
      return corsJson(req, { success: false, error: 'Invalid chain' }, { status: 400 })
    }
    if (!token || !isValidAddress(token)) {
      return corsJson(req, { success: false, error: 'Invalid token address' }, { status: 400 })
    }

    const callerAddresses = (addressesParam || '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)

    if (callerAddresses.some((a) => !isValidAddress(a))) {
      return corsJson(req, { success: false, error: 'Invalid address in list' }, { status: 400 })
    }
    if (callerAddresses.length > 5) {
      return corsJson(req, { success: false, error: 'Too many addresses' }, { status: 400 })
    }

    const protocolFeeRecipient = await getProtocolFeeRecipient(chain)

    const addresses = Array.from(new Set([
      ...callerAddresses.map((a) => a.toLowerCase()),
      protocolFeeRecipient.toLowerCase(),
    ])) as `0x${string}`[]

    const blacklisted = await checkBlacklist(chain, token.toLowerCase() as `0x${string}`, addresses)

    return corsJson(req, { success: true, blacklisted, protocolFeeRecipient: protocolFeeRecipient.toLowerCase() })
  } catch (err) {
    console.error('[/api/blacklist-check] error:', err)
    return corsJson(req, { success: false, error: 'Failed to check blacklist status' }, { status: 500 })
  }
}
