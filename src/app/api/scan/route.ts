import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scanContract } from '@/lib/scanner'
import { sweepTokenBalances, calcTotals } from '@/lib/sweeper'
import { isValidAddress } from '@/lib/utils'
import { checkRateLimit } from '@/lib/ratelimit'
import { Chain, ScanApiResponse } from '@/types'

// Never cache anything about this route — every scan must be live.
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
// Large contracts (e.g. USDC) hold hundreds of dust tokens — paginated
// discovery + pricing needs more than the default 10s.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { limited } = await checkRateLimit(req, 'scan')
    if (limited) {
      return NextResponse.json<ScanApiResponse>(
        { success: false, error: 'Too many scans — please wait a moment and try again.' },
        { status: 429 }
      )
    }

    const body = await req.json()
    const { address, chain } = body as { address: string; chain: Chain }

    // Validate inputs
    if (!address || !isValidAddress(address)) {
      return NextResponse.json<ScanApiResponse>(
        { success: false, error: 'Invalid contract address. Must be a valid 0x Ethereum address.' },
        { status: 400 }
      )
    }

    if (!chain || !['eth', 'base'].includes(chain)) {
      return NextResponse.json<ScanApiResponse>(
        { success: false, error: 'Invalid chain. Must be "eth" or "base".' },
        { status: 400 }
      )
    }

    // Confirm API keys are configured
    if (!process.env.ALCHEMY_ETH_RPC || !process.env.ALCHEMY_BASE_RPC) {
      return NextResponse.json<ScanApiResponse>(
        { success: false, error: 'RPC endpoints not configured. Check .env.local.' },
        { status: 500 }
      )
    }
    if (!process.env.ETHERSCAN_API_KEY) {
      return NextResponse.json<ScanApiResponse>(
        { success: false, error: 'Etherscan API key not configured. Check .env.local.' },
        { status: 500 }
      )
    }

    // Step 1: Run triage scan
    const result = await scanContract(address, chain)
    console.log(
      `[scan] ${chain}:${address} → name="${result.tokenName ?? 'NONE'}" symbol="${result.tokenSymbol ?? 'NONE'}" impl=${result.implementationAddress ?? 'none'} status=${result.triageStatus}`
    )

    // Step 2: Sweep token balances (M2)
    let strandedTokens: Awaited<ReturnType<typeof sweepTokenBalances>> = []
    try {
      strandedTokens = await sweepTokenBalances(address, chain)
    } catch (sweepErr) {
      console.error(`[scan→sweep] failed for ${chain}:${address}:`, sweepErr)
    }
    const { totalStrandedUsd, finderFeeUsd } = calcTotals(strandedTokens)

    // Step 3: Attach M2 data to result
    result.strandedTokens   = strandedTokens
    result.totalStrandedUsd = totalStrandedUsd
    result.finderFeeUsd     = finderFeeUsd

    // Step 4: Keep the leaderboard live — upsert this scan's row.
    // Fire-and-forget with its own error handling: a leaderboard hiccup
    // must never fail the scan itself.
    if (result.isContract) {
      try {
        const adminClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const { error: lbError } = await adminClient
          .from('salvage_leaderboard')
          .upsert({
            contract_address:   address.toLowerCase(),
            token_symbol:       result.tokenSymbol || 'MULTI',
            token_name:         result.tokenName   || 'Multiple tokens',
            chain,
            stranded_value_usd: totalStrandedUsd,
            triage_status:      result.triageStatus,
            deployer_address:   result.deployerAddress || null,
            last_scanned_at:    new Date().toISOString(),
          }, {
            onConflict: 'contract_address,chain',
          })
        if (lbError) console.error('[scan→leaderboard] upsert failed:', lbError.message)
      } catch (e) {
        console.error('[scan→leaderboard] error:', e)
      }
    }

    return NextResponse.json<ScanApiResponse>({ success: true, result })
  } catch (error) {
    console.error('[/api/scan] Error:', error)
    return NextResponse.json<ScanApiResponse>(
      { success: false, error: 'Scan failed. Check server logs.' },
      { status: 500 }
    )
  }
}