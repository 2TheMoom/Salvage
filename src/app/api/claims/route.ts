import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      claimId, chain, tokenAddress, tokenSymbol, victimAddress,
      finderAddress, lossTxHash, receiverAddress, valueUsd, registerTx,
    } = body

    if (!claimId || !chain || !tokenAddress || !victimAddress || !lossTxHash || !receiverAddress) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error } = await admin.from('salvage_claims').upsert({
      claim_id:         claimId,
      chain,
      token_address:    tokenAddress.toLowerCase(),
      token_symbol:     tokenSymbol || null,
      victim_address:   victimAddress.toLowerCase(),
      finder_address:   finderAddress ? finderAddress.toLowerCase() : null,
      loss_tx_hash:     lossTxHash,
      receiver_address: receiverAddress.toLowerCase(),
      value_usd:        valueUsd ?? null,
      register_tx:      registerTx || null,
    }, { onConflict: 'claim_id' })

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[/api/claims] error:', err)
    return NextResponse.json({ success: false, error: 'Failed to record claim' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const victim = req.nextUrl.searchParams.get('victim')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    let query = supabase
      .from('salvage_claims')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (victim) query = query.eq('victim_address', victim.toLowerCase())

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ success: true, claims: data })
  } catch (err) {
    console.error('[/api/claims] error:', err)
    return NextResponse.json({ success: false, error: 'Failed to fetch claims' }, { status: 500 })
  }
}
export async function PATCH(req: NextRequest) {
  try {
    const { claimId, status, settleTx } = await req.json()
    if (!claimId || !status || !['funded', 'settled'].includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid update' }, { status: 400 })
    }
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const update: Record<string, unknown> = { status }
    if (settleTx) update.settle_tx = settleTx
    if (status === 'settled') update.settled_at = new Date().toISOString()

    const { error } = await admin
      .from('salvage_claims')
      .update(update)
      .eq('claim_id', claimId)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[/api/claims PATCH] error:', err)
    return NextResponse.json({ success: false, error: 'Failed to update claim' }, { status: 500 })
  }
}