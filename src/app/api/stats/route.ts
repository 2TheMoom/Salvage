import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const { limited } = await checkRateLimit(req, 'stats')
    if (limited) {
      return NextResponse.json(
        { success: false, error: 'Too many requests — please wait a moment.' },
        { status: 429 }
      )
    }

    const { data, error } = await supabase
      .from('salvage_leaderboard')
      .select('stranded_value_usd, triage_status, chain')
      .gt('stranded_value_usd', 0)

    if (error) throw error

    let totalStrandedUsd  = 0
    let strandedEthUsd    = 0
    let strandedBaseUsd   = 0
    let recoverableUsd    = 0
    let recoverableCount  = 0

    for (const row of data || []) {
      const value = parseFloat(row.stranded_value_usd) || 0
      totalStrandedUsd += value
      if (row.chain === 'eth') strandedEthUsd += value
      else if (row.chain === 'base') strandedBaseUsd += value
      if (row.triage_status === 'recoverable' || row.triage_status === 'needs_action') {
        recoverableUsd += value
        recoverableCount++
      }
    }

    // Recovered stats from settled claims
    const { data: settled } = await supabase
      .from('salvage_claims')
      .select('value_usd, finder_address, settled_at')
      .eq('status', 'settled')

    let recoveredAllTime  = 0
    let recoveredThisMonth = 0
    let protocolFeesUsd   = 0
    let recoveredCount    = 0
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    for (const c of settled || []) {
      const v = parseFloat(c.value_usd) || 0
      recoveredAllTime += v
      recoveredCount++
      // Protocol cut: 5% victim-initiated (no finder), 3% finder-brokered
      const protocolRate = c.finder_address ? 0.03 : 0.05
      protocolFeesUsd += v * protocolRate
      if (c.settled_at && new Date(c.settled_at) >= monthStart) {
        recoveredThisMonth += v
      }
    }

    return NextResponse.json({
      success: true,
      stats: {
        totalStrandedUsd,
        strandedEthUsd,
        strandedBaseUsd,
        recoverableUsd,
        recoverableCount,
        contractsIndexed: (data || []).length,
        recoveredAllTime,
        recoveredThisMonth,
        protocolFeesUsd,
        recoveredCount,
      },
    })
  } catch (error) {
    console.error('[/api/stats] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}