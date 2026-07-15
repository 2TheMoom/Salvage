import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

interface ActivityItem {
  type: 'find' | 'claim_registered' | 'claim_settled'
  chain: string
  tokenSymbol: string | null
  valueUsd: number | null
  address: string
  txHash: string | null
  timestamp: string
}

// Chronological feed, not a ranked leaderboard — real volume is still low
// enough that a "Top Finders" or "Settled Recoveries" ranking would show
// one entry and read as dead rather than new. A timeline reads as "this is
// real and growing" from the same one entry.
export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const [findsRes, claimsRes] = await Promise.all([
      supabase.from('salvage_finds').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('salvage_claims').select('*').order('created_at', { ascending: false }).limit(20),
    ])

    if (findsRes.error) throw findsRes.error
    if (claimsRes.error) throw claimsRes.error

    // A find registers the scanned CONTRACT, not whatever token turned up
    // stranded inside it — "Find registered · USDT" for a find on the USDC
    // contract reads backwards. Look up each contract's own identity from
    // the leaderboard (already populated by every scan) instead of using
    // the stranded token's symbol.
    const contractKeys = [...new Set((findsRes.data ?? []).map((f) => `${f.chain}:${f.recipient_contract.toLowerCase()}`))]
    const contractLabels = new Map<string, string | null>()
    if (contractKeys.length > 0) {
      const { data: lbRows } = await supabase
        .from('salvage_leaderboard')
        .select('chain, contract_address, token_symbol, token_name')
        .in('contract_address', (findsRes.data ?? []).map((f) => f.recipient_contract.toLowerCase()))
      for (const row of lbRows ?? []) {
        contractLabels.set(`${row.chain}:${row.contract_address.toLowerCase()}`, row.token_symbol || row.token_name)
      }
    }

    const items: ActivityItem[] = []

    for (const f of findsRes.data ?? []) {
      const key = `${f.chain}:${f.recipient_contract.toLowerCase()}`
      items.push({
        type: 'find',
        chain: f.chain,
        tokenSymbol: contractLabels.get(key) ?? f.token_symbol,
        valueUsd: f.value_usd,
        address: f.finder_address,
        txHash: null,
        timestamp: f.created_at,
      })
    }

    for (const c of claimsRes.data ?? []) {
      items.push({
        type: 'claim_registered',
        chain: c.chain,
        tokenSymbol: c.token_symbol,
        valueUsd: c.value_usd,
        address: c.victim_address,
        txHash: c.register_tx,
        timestamp: c.created_at,
      })
      if (c.status === 'settled' && c.settled_at) {
        items.push({
          type: 'claim_settled',
          chain: c.chain,
          tokenSymbol: c.token_symbol,
          valueUsd: c.value_usd,
          address: c.victim_address,
          txHash: c.settle_tx,
          timestamp: c.settled_at,
        })
      }
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return NextResponse.json({ success: true, items: items.slice(0, 15) })
  } catch (err) {
    console.error('[/api/activity] error:', err)
    return NextResponse.json({ success: false, error: 'Failed to fetch activity', items: [] }, { status: 500 })
  }
}
