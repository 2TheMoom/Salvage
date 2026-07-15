import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isValidAddress } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

type ClaimStatus =
  | 'pending'              // no claim registered against this token yet
  | 'registered_for_you'   // claim registered, crediting this finder
  | 'settled_for_you'      // settled, this finder's 7% should have paid out
  | 'claimed_without_you'  // a claim exists but doesn't credit this finder
  | 'settled_without_you'  // settled without crediting this finder

interface StrandedTokenEntry {
  tokenAddress: string
  tokenSymbol: string | null
  valueUsd: number | null
}

interface TokenStatus extends StrandedTokenEntry {
  claimStatus: ClaimStatus
  registerTx: string | null
  settleTx: string | null
}

// Priority order for picking one "overall" status to show on the compact
// card — problems (a claim that skipped this finder) surface first, then
// progress, so nothing concerning gets silently averaged away by tokens
// still pending.
const STATUS_PRIORITY: ClaimStatus[] = [
  'claimed_without_you', 'settled_without_you', 'registered_for_you', 'settled_for_you', 'pending',
]

async function tokenClaimStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  chain: string, lossTxHash: string, entry: StrandedTokenEntry, finderLower: string
): Promise<TokenStatus> {
  const { data: claim } = await supabase
    .from('salvage_claims')
    .select('finder_address, status, register_tx, settle_tx')
    .eq('chain', chain)
    .eq('token_address', entry.tokenAddress.toLowerCase())
    .eq('loss_tx_hash', lossTxHash)
    .maybeSingle()

  let claimStatus: ClaimStatus
  if (!claim) {
    claimStatus = 'pending'
  } else if (claim.finder_address?.toLowerCase() !== finderLower) {
    claimStatus = claim.status === 'settled' ? 'settled_without_you' : 'claimed_without_you'
  } else {
    claimStatus = claim.status === 'settled' ? 'settled_for_you' : 'registered_for_you'
  }

  return { ...entry, claimStatus, registerTx: claim?.register_tx ?? null, settleTx: claim?.settle_tx ?? null }
}

async function withClaimStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  find: {
    find_key: string; chain: string; token_address: string; token_symbol: string | null
    loss_tx_hash: string; recipient_contract: string; value_usd: number | null
    created_at: string; finder_address: string; victim_wallet: string
    stranded_tokens: StrandedTokenEntry[] | null
  }
) {
  const lower = find.finder_address.toLowerCase()

  // Older finds (registered before stranded_tokens existed) only ever
  // captured a single token — fall back to that as a one-element list.
  const entries: StrandedTokenEntry[] = find.stranded_tokens?.length
    ? find.stranded_tokens
    : [{ tokenAddress: find.token_address, tokenSymbol: find.token_symbol, valueUsd: find.value_usd }]

  const [tokens, contractInfo] = await Promise.all([
    Promise.all(entries.map((entry) => tokenClaimStatus(supabase, find.chain, find.loss_tx_hash, entry, lower))),
    // The find registers the *contract*, not a token inside it — its own
    // identity (e.g. "USDC" if that's the scanned contract) is what a finder
    // actually called dibs on, already captured by every scan that wrote
    // this contract to the leaderboard. Reused here rather than duplicated.
    supabase
      .from('salvage_leaderboard')
      .select('token_name, token_symbol')
      .eq('chain', find.chain)
      .eq('contract_address', find.recipient_contract.toLowerCase())
      .maybeSingle()
      .then((r: { data: { token_name: string | null; token_symbol: string | null } | null }) => r.data),
  ])

  const overall = tokens.reduce((worst, t) => (
    STATUS_PRIORITY.indexOf(t.claimStatus) < STATUS_PRIORITY.indexOf(worst) ? t.claimStatus : worst
  ), 'pending' as ClaimStatus)

  const totalValueUsd = tokens.reduce((sum, t) => sum + (t.valueUsd || 0), 0)

  return {
    findKey: find.find_key,
    chain: find.chain,
    recipientContract: find.recipient_contract,
    contractName: contractInfo?.token_name ?? null,
    contractSymbol: contractInfo?.token_symbol ?? null,
    victimWallet: find.victim_wallet,
    lossTxHash: find.loss_tx_hash,
    finderAddress: find.finder_address,
    createdAt: find.created_at,
    tokens,
    claimStatus: overall,
    valueUsd: totalValueUsd || null,
    // Kept for older callers expecting a single tx — points at the first
    // token that actually has one.
    registerTx: tokens.find((t) => t.registerTx)?.registerTx ?? null,
    settleTx: tokens.find((t) => t.settleTx)?.settleTx ?? null,
  }
}

const FIND_COLUMNS = 'find_key, chain, token_address, token_symbol, loss_tx_hash, recipient_contract, value_usd, created_at, finder_address, victim_wallet, stranded_tokens'

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
