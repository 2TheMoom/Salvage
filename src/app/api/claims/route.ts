import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { corsJson, corsPreflight } from '@/lib/cors'
import { checkRateLimit } from '@/lib/ratelimit'
import { readOnChainClaim } from '@/lib/contracts'
import { zeroAddress } from 'viem'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// This route has no signature check of its own (unlike /api/finds), so every
// identity-bearing field is read directly from the router contract rather
// than trusted from the request body — a caller can only ever record a claim
// that genuinely exists on-chain, with its real token/victim/finder/receiver.
// The client only supplies display metadata (symbol, USD estimate, tx hash for
// the explorer link) plus claimId/chain to know what to look up.
export async function POST(req: NextRequest) {
  try {
    const { limited } = await checkRateLimit(req, 'claims-post')
    if (limited) {
      return corsJson(req, { success: false, error: 'Too many requests — please wait a moment.' }, { status: 429 })
    }

    const body = await req.json()
    const { claimId, chain, tokenSymbol, valueUsd, registerTx } = body

    if (!claimId || !chain || !['eth', 'base'].includes(chain)) {
      return corsJson(req, { success: false, error: 'Missing required fields' }, { status: 400 })
    }

    const onChain = await readOnChainClaim(chain, claimId as `0x${string}`)
    if (!onChain) {
      return corsJson(req,
        { success: false, error: 'Claim not found on-chain yet. Wait for the registration transaction to confirm and try again.' },
        { status: 404 }
      )
    }

    const admin = adminClient()
    const { error } = await admin.from('salvage_claims').upsert({
      claim_id:         claimId,
      chain,
      token_address:    onChain.token.toLowerCase(),
      token_symbol:     tokenSymbol || null,
      victim_address:   onChain.victim.toLowerCase(),
      finder_address:   onChain.finder !== zeroAddress ? onChain.finder.toLowerCase() : null,
      loss_tx_hash:     onChain.lossTxHash,
      receiver_address: onChain.receiver.toLowerCase(),
      value_usd:        valueUsd ?? null,
      register_tx:      registerTx || null,
    }, { onConflict: 'claim_id' })

    if (error) throw error
    return corsJson(req, { success: true })
  } catch (err) {
    console.error('[/api/claims] error:', err)
    return corsJson(req, { success: false, error: 'Failed to record claim' }, { status: 500 })
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
    return corsJson(req, { success: true, claims: data })
  } catch (err) {
    console.error('[/api/claims] error:', err)
    return corsJson(req, { success: false, error: 'Failed to fetch claims' }, { status: 500 })
  }
}

// Settlement is the one status transition anything ever asks for in
// practice — the DB never actually reaches 'funded' via this route (nothing
// calls it with that status), so it isn't offered here. Before flipping to
// 'settled', the router's own totalSettled is read back to confirm the
// settle() call actually landed — a client can no longer just assert it.
export async function PATCH(req: NextRequest) {
  try {
    const { limited } = await checkRateLimit(req, 'claims-patch')
    if (limited) {
      return corsJson(req, { success: false, error: 'Too many requests — please wait a moment.' }, { status: 429 })
    }

    const { claimId, settleTx } = await req.json()
    if (!claimId) {
      return corsJson(req, { success: false, error: 'Missing claimId' }, { status: 400 })
    }

    const admin = adminClient()
    const { data: existing } = await admin
      .from('salvage_claims')
      .select('chain')
      .eq('claim_id', claimId)
      .maybeSingle()

    if (!existing) {
      return corsJson(req, { success: false, error: 'Unknown claim' }, { status: 404 })
    }

    const onChain = await readOnChainClaim(existing.chain, claimId as `0x${string}`)
    if (!onChain || onChain.totalSettled <= 0n) {
      return corsJson(req, { success: false, error: 'Not settled on-chain yet.' }, { status: 400 })
    }

    const { error } = await admin
      .from('salvage_claims')
      .update({
        status:      'settled',
        settle_tx:   settleTx || null,
        settled_at:  new Date().toISOString(),
      })
      .eq('claim_id', claimId)
    if (error) throw error
    return corsJson(req, { success: true })
  } catch (err) {
    console.error('[/api/claims PATCH] error:', err)
    return corsJson(req, { success: false, error: 'Failed to update claim' }, { status: 500 })
  }
}
