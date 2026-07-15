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
    const chain = searchParams.get('chain') || 'eth'
    const page  = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const from  = (page - 1) * PAGE_SIZE
    const to    = from + PAGE_SIZE - 1

    // True paged navigation, not an ever-growing "load more" list — the
    // sidebar's height needs a fixed ceiling regardless of how much real
    // data accumulates, so an exact count drives "Page X of Y" rather than
    // just a hasMore flag.
    const { data, error, count } = await supabase
      .from('salvage_leaderboard')
      .select('*', { count: 'exact' })
      .eq('chain', chain)
      .gt('stranded_value_usd', 0)
      .order('stranded_value_usd', { ascending: false })
      .range(from, to)

    if (error) throw error

    const totalCount = count ?? 0
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

    return NextResponse.json({ success: true, data: data || [], page, totalPages, totalCount })
  } catch (error) {
    console.error('[/api/leaderboard] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leaderboard', data: [], page: 1, totalPages: 1, totalCount: 0 },
      { status: 500 }
    )
  }
}
