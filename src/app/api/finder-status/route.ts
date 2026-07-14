import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isValidAddress } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

type ClaimStatus =
  | 'pending'              // no claim registered against this find yet
  | 'registered_for_you'   // claim registered, crediting this finder
  | 'settled_for_you'      // settled, this finder's 7% should have paid out
  | 'claimed_without_you'  // a claim exists but doesn't credit this finder
  | 'settled_without_you'  // settled without crediting this finder

async function withClaimStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  find: {
    find_key: string; chain: string; token_address: string; token_symbol: string | null
    loss_tx_hash: string; recipient_contract: string; value_usd: number | null
    created_at: string; finder_address: string; victim_wallet: string
  }
) {
  const lower = find.finder_address.toLowerCase()
  const { data: claim } = await supabase
    .from('salvage_claims')
    .select('finder_address, status, register_tx, settle_tx')
    .eq('chain', find.chain)
    .eq('token_address', find.token_address)
    .eq('loss_tx_hash', find.loss_tx_hash)
    .maybeSingle()

  let claimStatus: ClaimStatus
  if (!claim) {
    claimStatus = 'pending'
  } else if (claim.finder_address?.toLowerCase() !== lower) {
    claimStatus = claim.status === 'settled' ? 'settled_without_you' : 'claimed_without_you'
  } else {
    claimStatus = claim.status === 'settled' ? 'settled_for_you' : 'registered_for_you'
  }

  return {
    findKey: find.find_key,
    chain: find.chain,
    tokenAddress: find.token_address,
    tokenSymbol: find.token_symbol,
    valueUsd: find.value_usd,
    recipientContract: find.recipient_contract,
    victimWallet: find.victim_wallet,
    lossTxHash: find.loss_tx_hash,
    finderAddress: find.finder_address,
    createdAt: find.created_at,
    claimStatus,
    registerTx: claim?.register_tx ?? null,
    settleTx: claim?.settle_tx ?? null,
  }
}

const FIND_COLUMNS = 'find_key, chain, token_address, token_symbol, loss_tx_hash, recipient_contract, value_usd, created_at, finder_address, victim_wallet'

// Pure DB lookups — no live re-scan. A finder's own registration off-chain
// (salvage_finds) says nothing on its own about whether it ever actually
// got threaded into an on-chain claim; that has to be checked against
// salvage_claims for the same (chain, token, lossTxHash) directly, since
// nothing keeps finds.status in sync with what actually happened on-chain.
export async function GET(req: NextRequest) {
  try {
    const finder = req.nextUrl.searchParams.get('finder')
    const findKey = req.nextUrl.searchParams.get('findKey')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Single-find lookup — powers the find detail page. No finder address
    // needed up front; the find row itself already says who registered it.
    if (findKey) {
      const { data: find, error } = await supabase
        .from('salvage_finds')
        .select(FIND_COLUMNS)
        .eq('find_key', findKey)
        .maybeSingle()
      if (error) throw error
      if (!find) {
        return NextResponse.json({ success: false, error: 'Find not found' }, { status: 404 })
      }
      const item = await withClaimStatus(supabase, find)
      return NextResponse.json({ success: true, item })
    }

    if (!finder || !isValidAddress(finder)) {
      return NextResponse.json({ success: false, error: 'Invalid finder address' }, { status: 400 })
    }
    const lower = finder.toLowerCase()

    const { data: finds, error: findsError } = await supabase
      .from('salvage_finds')
      .select(FIND_COLUMNS)
      .eq('finder_address', lower)
      .order('created_at', { ascending: false })

    if (findsError) throw findsError

    const items = await Promise.all((finds ?? []).map((find) => withClaimStatus(supabase, find)))

    return NextResponse.json({ success: true, items })
  } catch (err) {
    console.error('[/api/finder-status] error:', err)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch finder status', items: [] },
      { status: 500 }
    )
  }
}
