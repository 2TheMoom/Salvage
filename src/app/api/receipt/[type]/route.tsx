import { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Matches the same 7% approximation used app-wide (landing page example
// card, src/lib/outreach.ts, src/lib/sweeper.ts, FinderFindCard) rather than
// introducing a new one. Router fee schedule (frozen per claim, see
// SalvageRecoveryRouter.sol): 95%/5% victim-initiated, 90%/7%/3% brokered.
const FINDER_FEE_RATE = 0.07
const VICTIM_BROKERED_RATE = 0.90
const VICTIM_SELF_RATE = 0.95

const WIDTH = 1200
const HEIGHT = 630

const CARD_BG    = '#F5F3EF'
const TEXT       = '#1A1A1E'
const TEXT_2     = '#5B5B63'
const ETH_BLUE   = '#627EEA'
const GREEN      = '#1A6B3C'
const BORDER     = 'rgba(26,26,30,0.14)'

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(2)}`
}

function errorCard(message: string) {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: CARD_BG, color: TEXT_2, fontSize: 32,
      }}>
        {message}
      </div>
    ),
    { width: WIDTH, height: HEIGHT }
  )
}

// Shared card chrome — a big headline stat with a label above it, the
// contract identity below, and the Salvage wordmark in the corner. Kept as
// one layout function (not JSX components) since satori's supported element
// set is a subset of the DOM and this avoids indirection that doesn't help.
function renderCard(params: {
  eyebrow: string
  headline: string
  headlineColor: string
  contractLabel: string
  contractAddress: string
  chain: string
}) {
  const explorer = params.chain === 'eth' ? 'Ethereum' : 'Base'
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', background: CARD_BG, padding: '64px 72px',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: TEXT_2 }}>
            {params.eyebrow}
          </div>
          <div style={{ fontSize: 108, fontWeight: 800, color: params.headlineColor, marginTop: 16, display: 'flex' }}>
            {params.headline}
          </div>
          <div style={{ fontSize: 34, color: TEXT, marginTop: 24, display: 'flex' }}>
            {params.contractLabel}
          </div>
          <div style={{ fontSize: 24, color: TEXT_2, marginTop: 8, display: 'flex' }}>
            {explorer} · {params.contractAddress.slice(0, 6)}…{params.contractAddress.slice(-4)}
          </div>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderTop: `2px solid ${BORDER}`, paddingTop: 24,
        }}>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 800, letterSpacing: 1, color: TEXT }}>
            SALVAGE
          </div>
          <div style={{ display: 'flex', fontSize: 24, color: TEXT_2 }}>
            usesalvage.xyz
          </div>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT }
  )
}

async function contractLabelFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, chain: string, recipientContract: string
): Promise<string> {
  const { data } = await supabase
    .from('salvage_leaderboard')
    .select('token_name, token_symbol')
    .eq('chain', chain)
    .eq('contract_address', recipientContract.toLowerCase())
    .maybeSingle()
  return data?.token_symbol || data?.token_name || 'Unverified contract'
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params
  if (type !== 'find' && type !== 'settle') return errorCard('Unknown receipt type')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const findKey = req.nextUrl.searchParams.get('findKey')

  if (type === 'find') {
    // A registration receipt is inherently a finder concept — always needs
    // the finder's find row.
    if (!findKey) return errorCard('Missing findKey')

    const { data: find } = await supabase
      .from('salvage_finds')
      .select('chain, value_usd, recipient_contract, stranded_tokens')
      .eq('find_key', findKey)
      .maybeSingle()
    if (!find) return errorCard('Find not found')

    const contractLabel = await contractLabelFor(supabase, find.chain, find.recipient_contract)
    const strandedTokens = find.stranded_tokens as { valueUsd: number }[] | null
    const totalUsd = strandedTokens?.length
      ? strandedTokens.reduce((sum, t) => sum + (t.valueUsd || 0), 0)
      : (find.value_usd || 0)

    return renderCard({
      eyebrow: 'Find registered — could earn',
      headline: formatUsd(totalUsd * FINDER_FEE_RATE),
      headlineColor: ETH_BLUE,
      contractLabel: `${formatUsd(totalUsd)} stranded in ${contractLabel}`,
      contractAddress: find.recipient_contract,
      chain: find.chain,
    })
  }

  // type === 'settle' — supports two lookup paths, since not every settled
  // claim has a finder-registered find behind it. A victim who self-registers
  // (RecoveryClaimPanel/OwnerClaimPanel, finder = address(0)) never creates a
  // salvage_finds row at all, so those callers pass the claim's own identity
  // directly instead of a findKey.
  const token = req.nextUrl.searchParams.get('token')
  const perspective = req.nextUrl.searchParams.get('perspective') === 'victim' ? 'victim' : 'finder'
  if (!token) return errorCard('Missing token')

  let chain: string
  let lossTxHash: string
  let recipientContract: string

  if (findKey) {
    const { data: find } = await supabase
      .from('salvage_finds')
      .select('chain, loss_tx_hash, recipient_contract')
      .eq('find_key', findKey)
      .maybeSingle()
    if (!find) return errorCard('Find not found')
    chain = find.chain
    lossTxHash = find.loss_tx_hash
    recipientContract = find.recipient_contract
  } else {
    chain = req.nextUrl.searchParams.get('chain') || ''
    lossTxHash = req.nextUrl.searchParams.get('lossTxHash') || ''
    recipientContract = req.nextUrl.searchParams.get('recipientContract') || ''
    if (!chain || !lossTxHash || !recipientContract) return errorCard('Missing claim identity')
  }

  const { data: claim } = await supabase
    .from('salvage_claims')
    .select('value_usd, finder_address, status')
    .eq('chain', chain)
    .eq('token_address', token.toLowerCase())
    .eq('loss_tx_hash', lossTxHash)
    .maybeSingle()

  if (!claim || claim.status !== 'settled') return errorCard('Not settled yet')

  const valueUsd = claim.value_usd || 0
  const isFinderBrokered = !!claim.finder_address

  const payoutUsd = perspective === 'finder'
    ? valueUsd * FINDER_FEE_RATE
    : valueUsd * (isFinderBrokered ? VICTIM_BROKERED_RATE : VICTIM_SELF_RATE)

  const contractLabel = await contractLabelFor(supabase, chain, recipientContract)

  return renderCard({
    eyebrow: perspective === 'finder' ? 'Recovery settled — you earned' : 'Recovery settled — you recovered',
    headline: formatUsd(payoutUsd),
    headlineColor: GREEN,
    contractLabel,
    contractAddress: recipientContract,
    chain,
  })
}
