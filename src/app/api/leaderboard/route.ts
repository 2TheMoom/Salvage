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

// POST — add or update a leaderboard entry (server-side only, uses service role)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      contract_address,
      token_symbol,
      token_name,
      chain,
      stranded_value_usd,
      triage_status,
      deployer_address,
      notes,
    } = body

    if (!contract_address || !chain || !triage_status) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Use service role for writes — needs SUPABASE_SERVICE_ROLE_KEY
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await adminClient
      .from('salvage_leaderboard')
      .upsert({
        contract_address,
        token_symbol:      token_symbol || 'MULTI',
        token_name:        token_name   || 'Multiple tokens',
        chain,
        stranded_value_usd,
        triage_status,
        deployer_address,
        notes,
        verified:          false,
        last_scanned_at:   new Date().toISOString(),
      }, {
        onConflict: 'contract_address,chain',
      })
      .select()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[/api/leaderboard POST] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update leaderboard' },
      { status: 500 }
    )
  }
}