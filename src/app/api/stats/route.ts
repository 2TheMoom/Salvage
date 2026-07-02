import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('salvage_leaderboard')
      .select('stranded_value_usd, triage_status, chain')
      .gt('stranded_value_usd', 0)

    if (error) throw error

    let totalStrandedUsd = 0
    let recoverableUsd   = 0
    let recoverableCount = 0

    for (const row of data || []) {
      const value = parseFloat(row.stranded_value_usd) || 0
      totalStrandedUsd += value
      if (row.triage_status === 'recoverable' || row.triage_status === 'needs_action') {
        recoverableUsd += value
        recoverableCount++
      }
    }

    return NextResponse.json({
      success: true,
      stats: {
        totalStrandedUsd,
        recoverableUsd,
        recoverableCount,
        contractsIndexed: (data || []).length,
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