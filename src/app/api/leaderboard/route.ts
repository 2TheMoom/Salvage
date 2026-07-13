import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const chain = searchParams.get('chain') || 'eth'

    const { data, error } = await supabase
      .from('salvage_leaderboard')
      .select('*')
      .eq('chain', chain)
      .gt('stranded_value_usd', 0)
      .order('stranded_value_usd', { ascending: false })
      .limit(20)

    if (error) throw error

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('[/api/leaderboard] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leaderboard', data: [] },
      { status: 500 }
    )
  }
}