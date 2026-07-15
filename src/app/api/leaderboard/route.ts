import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const PAGE_SIZE = 10

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const chain  = searchParams.get('chain') || 'eth'
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0)

    // Fetch one extra row to know whether another page exists, without a
    // separate count() query.
    const { data, error } = await supabase
      .from('salvage_leaderboard')
      .select('*')
      .eq('chain', chain)
      .gt('stranded_value_usd', 0)
      .order('stranded_value_usd', { ascending: false })
      .range(offset, offset + PAGE_SIZE)

    if (error) throw error

    const rows = data || []
    const hasMore = rows.length > PAGE_SIZE

    return NextResponse.json({ success: true, data: rows.slice(0, PAGE_SIZE), hasMore })
  } catch (error) {
    console.error('[/api/leaderboard] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leaderboard', data: [], hasMore: false },
      { status: 500 }
    )
  }
}