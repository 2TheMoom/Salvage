import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isValidAddress } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Pure lookups against our own already-scanned data — never triggers a live
// re-scan. Two different kinds of "relevant to this wallet":
//   - contracts Salvage has already seen where this wallet is the on-chain
//     owner() (only ever reflects prior scans, not a chain-wide discovery)
//   - claims where this wallet is the registered victim/beneficiary and the
//     recovery hasn't settled yet
export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get('wallet')
    if (!wallet || !isValidAddress(wallet)) {
      return NextResponse.json({ success: false, error: 'Invalid wallet address' }, { status: 400 })
    }
    const lower = wallet.toLowerCase()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const [ownedRes, claimsRes] = await Promise.all([
      supabase
        .from('salvage_leaderboard')
        .select('contract_address, chain, token_name, token_symbol, stranded_value_usd, triage_status')
        .eq('owner_address', lower)
        .gt('stranded_value_usd', 0),
      supabase
        .from('salvage_claims')
        .select('claim_id, chain, token_address, token_symbol, value_usd, receiver_address, register_tx, status')
        .eq('victim_address', lower)
        .neq('status', 'settled'),
    ])

    if (ownedRes.error) throw ownedRes.error
    if (claimsRes.error) throw claimsRes.error

    return NextResponse.json({
      success: true,
      ownedContracts: ownedRes.data ?? [],
      pendingClaims: claimsRes.data ?? [],
    })
  } catch (err) {
    console.error('[/api/owner-status] error:', err)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch owner status', ownedContracts: [], pendingClaims: [] },
      { status: 500 }
    )
  }
}
