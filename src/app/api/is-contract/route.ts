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

    const [eth, base] = await Promise.all([
      isContract(address, 'eth'),
      isContract(address, 'base'),
    ])

    return NextResponse.json(
      { success: true, address, eth, base },
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
