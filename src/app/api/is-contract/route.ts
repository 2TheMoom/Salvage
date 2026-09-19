import { NextRequest, NextResponse } from 'next/server'
import { isContract } from '@/lib/scanner'
import { isValidAddress } from '@/lib/utils'
import { checkRateLimit } from '@/lib/ratelimit'

// Never cache — an address can go from EOA to deployed contract at any time.
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Wildcard CORS: read-only, no user data in or out beyond the address itself,
// called from the Chrome extension's background service worker (unique
// chrome-extension:// origin per install, not a fixed origin we can allow-list).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function GET(req: NextRequest) {
  try {
    const { limited } = await checkRateLimit(req, 'is-contract')
    if (limited) {
      return NextResponse.json(
        { success: false, error: 'Too many requests — please wait a moment.' },
        { status: 429, headers: corsHeaders }
      )
    }

    const address = req.nextUrl.searchParams.get('address')
    if (!address || !isValidAddress(address)) {
      return NextResponse.json(
        { success: false, error: 'Invalid address' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Serialized, not Promise.all — concurrent RPC calls to Alchemy's Arc
    // endpoint specifically were observed returning a false "not a contract"
    // from Vercel's network path (confirmed deterministic in production,
    // not reproducible locally), even though the exact same call made alone
    // succeeds reliably. Serializing costs a little latency but removes
    // whatever contention causes that.
    const eth  = await isContract(address, 'eth')
    const base = await isContract(address, 'base')
    const arc  = await isContract(address, 'arc')

    return NextResponse.json(
      {
        success: true, address, eth, base, arc,
        debugArcRpcUrlDefined: Boolean(process.env.ALCHEMY_ARC_RPC),
        debugArcRpcUrlTail: (process.env.ALCHEMY_ARC_RPC || '').slice(-6),
      },
      { headers: corsHeaders }
    )
  } catch (err) {
    console.error('[/api/is-contract] error:', err)
    return NextResponse.json(
      { success: false, error: 'Failed to check address' },
      { status: 500, headers: corsHeaders }
    )
  }
}
