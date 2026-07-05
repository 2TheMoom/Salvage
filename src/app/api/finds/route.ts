import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyMessage } from 'viem'
import { notifyVictimOfClaim } from '@/lib/notify'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// First-finder-wins registration of a discovered stranded find.
// Off-chain and victim-signature-free by design: this only locks in
// finder PRIORITY (the 7% claim) with a timestamp. The on-chain claim,
// with the victim's own EIP-712 signature, happens later at settlement.
export async function POST(req: NextRequest) {
  try {
    const {
      chain, victimWallet, tokenAddress, tokenSymbol, lossTxHash,
      recipientContract, valueUsd, finderAddress, signature, message,
    } = await req.json()

    if (!chain || !victimWallet || !tokenAddress || !lossTxHash ||
        !finderAddress || !signature || !message) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    // Verify the finder actually signed the agreement
    const valid = await verifyMessage({
      address: finderAddress as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    })
    if (!valid) {
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 401 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // find_key = the unique recovery this find refers to. First writer wins;
    // a later finder hitting the same key is rejected by the unique constraint.
    const findKey = `${chain}:${tokenAddress.toLowerCase()}:${lossTxHash.toLowerCase()}`

    const { error } = await admin.from('salvage_finds').insert({
      find_key:           findKey,
      chain,
      victim_wallet:      victimWallet.toLowerCase(),
      token_address:      tokenAddress.toLowerCase(),
      token_symbol:       tokenSymbol || null,
      loss_tx_hash:       lossTxHash,
      recipient_contract: recipientContract.toLowerCase(),
      value_usd:          valueUsd ?? null,
      finder_address:     finderAddress.toLowerCase(),
      finder_signature:   signature,
    })

    if (error) {
      // Unique-violation = someone already claimed this find
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'This find is already registered by another finder.' },
          { status: 409 }
        )
      }
      throw error
    }

    // Fire-and-forget: notify the victim if they've opened the Salvage
    // Mini App and enabled notifications. Never blocks or fails the find
    // registration — a missing token is the normal case, not an error.
    notifyVictimOfClaim(
      victimWallet,
      tokenSymbol || 'tokens',
      valueUsd ?? 0
    ).catch((e) => console.error('[/api/finds] notify failed:', e))

    return NextResponse.json({ success: true, findKey })
  } catch (err) {
    console.error('[/api/finds] error:', err)
    return NextResponse.json({ success: false, error: 'Failed to register find' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const finder = req.nextUrl.searchParams.get('finder')
    const findKey = req.nextUrl.searchParams.get('findKey')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    if (findKey) {
      const { data, error } = await supabase
        .from('salvage_finds')
        .select('*')
        .eq('find_key', findKey)
        .maybeSingle()
      if (error) throw error
      return NextResponse.json({ success: true, find: data })
    }

    let query = supabase
      .from('salvage_finds')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (finder) query = query.eq('finder_address', finder.toLowerCase())

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ success: true, finds: data })
  } catch (err) {
    console.error('[/api/finds] error:', err)
    return NextResponse.json({ success: false, error: 'Failed to fetch finds' }, { status: 500 })
  }
}