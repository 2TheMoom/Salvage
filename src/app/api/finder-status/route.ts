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

// Pure DB lookups — no live re-scan. A finder's own registration off-chain
// (salvage_finds) says nothing on its own about whether it ever actually
// got threaded into an on-chain claim; that has to be checked against
// salvage_claims for the same (chain, token, lossTxHash) directly, since
// nothing keeps finds.status in sync with what actually happened on-chain.
export async function GET(req: NextRequest) {
  try {
    const finder = req.nextUrl.searchParams.get('finder')
    if (!finder || !isValidAddress(finder)) {
      return NextResponse.json({ success: false, error: 'Invalid finder address' }, { status: 400 })
    }
    const lower = finder.toLowerCase()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: finds, error: findsError } = await supabase
      .from('salvage_finds')
      .select('find_key, chain, token_address, token_symbol, loss_tx_hash, recipient_contract, value_usd, created_at')
      .eq('finder_address', lower)
      .order('created_at', { ascending: false })

    if (findsError) throw findsError

    const items = await Promise.all(
      (finds ?? []).map(async (find) => {
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
          tokenSymbol: find.token_symbol,
          valueUsd: find.value_usd,
          recipientContract: find.recipient_contract,
          createdAt: find.created_at,
          claimStatus,
          registerTx: claim?.register_tx ?? null,
          settleTx: claim?.settle_tx ?? null,
        }
      })
    )

    return NextResponse.json({ success: true, items })
  } catch (err) {
    console.error('[/api/finder-status] error:', err)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch finder status', items: [] },
      { status: 500 }
    )
  }
}
