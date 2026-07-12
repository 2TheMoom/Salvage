import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyMessage } from 'viem'
import { notifyVictimOfClaim } from '@/lib/notify'
import { corsJson, corsPreflight } from '@/lib/cors'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// A finder registration that never converts into a settled recovery within
// this window is released — otherwise a single stale (or bot-squatted)
// registration would lock a find_key forever, permanently blocking any
// finder who could actually deliver the outreach. Matches the 90-day
// window already stated elsewhere in the product's own copy.
const FINDER_PRIORITY_MS = 90 * 24 * 60 * 60 * 1000

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

// First-finder-wins registration of a discovered stranded find.
// Off-chain and victim-signature-free by design: this only locks in
// finder PRIORITY (the 7% claim) with a timestamp. The on-chain claim,
// with the victim's own EIP-712 signature, happens later at settlement.
export async function POST(req: NextRequest) {
  try {
    const {
      chain, victimWallet, tokenAddress, tokenSymbol, lossTxHash,
      recipientContract, valueUsd, finderAddress, signature, message,
      findKeyOverride,
    } = await req.json()

    if (!chain || !victimWallet || !tokenAddress || !lossTxHash ||
        !finderAddress || !signature || !message) {
      return corsJson(req, { success: false, error: 'Missing required fields' }, { status: 400 })
    }

    // A finder can never be the victim/loss wallet itself — the on-chain
    // router rejects finder == victim at settlement anyway, so a match here
    // would permanently squat this find's registration slot for a claim
    // that can never actually pay out. Reject it up front instead.
    if (finderAddress.toLowerCase() === victimWallet.toLowerCase()) {
      return corsJson(req, 
        { success: false, error: 'You cannot register as the finder of your own loss.' },
        { status: 400 }
      )
    }

    // Verify the finder actually signed the agreement
    const valid = await verifyMessage({
      address: finderAddress as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    })
    if (!valid) {
      return corsJson(req, { success: false, error: 'Invalid signature' }, { status: 401 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // find_key = the unique recovery this find refers to. First writer wins
    // — but only while that registration is either recent or actually
    // recovered; see the staleness check below.
    const findKey = findKeyOverride
      || `${chain}:${tokenAddress.toLowerCase()}:${lossTxHash.toLowerCase()}`

    const findRow = {
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
    }

    const { data: existing } = await admin
      .from('salvage_finds')
      .select('created_at')
      .eq('find_key', findKey)
      .maybeSingle()

    if (existing) {
      // Never reopen a find that already paid out — settlement is
      // authoritative on salvage_claims, not the finds table's own status
      // column, since nothing else keeps that column in sync.
      const { data: settledClaim } = await admin
        .from('salvage_claims')
        .select('claim_id')
        .eq('chain', chain)
        .eq('token_address', tokenAddress.toLowerCase())
        .eq('loss_tx_hash', lossTxHash)
        .eq('status', 'settled')
        .maybeSingle()

      if (settledClaim) {
        return corsJson(req,
          { success: false, error: 'This find has already been recovered.' },
          { status: 409 }
        )
      }

      const ageMs = Date.now() - new Date(existing.created_at).getTime()
      if (ageMs < FINDER_PRIORITY_MS) {
        return corsJson(req,
          { success: false, error: 'This find is already registered by another finder.' },
          { status: 409 }
        )
      }

      // Stale and never recovered — release it to the new finder.
      const { error: updateError } = await admin
        .from('salvage_finds')
        .update({ ...findRow, created_at: new Date().toISOString() })
        .eq('find_key', findKey)
      if (updateError) throw updateError
    } else {
      const { error } = await admin.from('salvage_finds').insert(findRow)

      if (error) {
        // Unique-violation = a concurrent request won the race between our
        // existence check above and this insert — same outcome as the
        // recent-registration case.
        if (error.code === '23505') {
          return corsJson(req,
            { success: false, error: 'This find is already registered by another finder.' },
            { status: 409 }
          )
        }
        throw error
      }
    }

    // Fire-and-forget: notify the victim if they've opened the Salvage
    // Mini App and enabled notifications. Never blocks or fails the find
    // registration — a missing token is the normal case, not an error.
    notifyVictimOfClaim(
      victimWallet,
      tokenSymbol || 'tokens',
      valueUsd ?? 0
    ).catch((e) => console.error('[/api/finds] notify failed:', e))

    return corsJson(req, { success: true, findKey })
  } catch (err) {
    console.error('[/api/finds] error:', err)
    return corsJson(req, { success: false, error: 'Failed to register find' }, { status: 500 })
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
      return corsJson(req, { success: true, find: data })
    }

    let query = supabase
      .from('salvage_finds')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (finder) query = query.eq('finder_address', finder.toLowerCase())

    const { data, error } = await query
    if (error) throw error
    return corsJson(req, { success: true, finds: data })
  } catch (err) {
    console.error('[/api/finds] error:', err)
    return corsJson(req, { success: false, error: 'Failed to fetch finds' }, { status: 500 })
  }
}