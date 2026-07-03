import { Chain, VictimFinding, VictimScanResult, TriageStatus } from '@/types'
import { scanContract, detectRescueFunction, fetchAbi } from '@/lib/scanner'
import { fetchPricesByAddress, getTokenMetadata, formatBalance, SYMBOL_MAP } from '@/lib/sweeper'

// ── Victim scan: find tokens a wallet mistakenly sent to contract addresses.
//
// v1 targets the unambiguous, highest-signal mistake: a DIRECT `transfer()`
// call whose recipient is itself an ERC-20 token contract — including the
// classic case of sending a token to its own contract. Swaps and router
// interactions are excluded by construction (their tx.to is the router,
// not the token, and the recipient is decoded from a direct transfer input).

const TRANSFER_SELECTOR = '0xa9059cbb'
const MAX_TRANSFER_PAGES = 3      // up to ~3000 outgoing transfers
const MAX_FINDINGS       = 25     // per-scan cap on candidate verification
const MAX_TRIAGED        = 4      // recipient contracts triaged (Etherscan budget)

function getRpcUrl(chain: Chain): string {
  if (chain === 'eth')  return process.env.ALCHEMY_ETH_RPC!
  if (chain === 'base') return process.env.ALCHEMY_BASE_RPC!
  throw new Error(`Unknown chain: ${chain}`)
}

async function rpc(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  try {
    const res = await fetch(rpcUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    })
    const data = await res.json()
    return data.result ?? null
  } catch {
    return null
  }
}

interface RawTransfer {
  hash: string
  to: string | null
  rawContract: { address: string | null; value: string | null; decimal: string | null }
  asset: string | null
  value: number | null
  metadata?: { blockTimestamp?: string }
}

// All outgoing ERC-20 transfers for the wallet (paginated)
async function getOutgoingTransfers(wallet: string, chain: Chain): Promise<RawTransfer[]> {
  const rpcUrl = getRpcUrl(chain)
  const all: RawTransfer[] = []
  let pageKey: string | undefined

  for (let page = 0; page < MAX_TRANSFER_PAGES; page++) {
    const params: Record<string, unknown> = {
      fromBlock:    '0x0',
      toBlock:      'latest',
      fromAddress:  wallet,
      category:     ['erc20'],
      withMetadata: true,
      order:        'desc',
      maxCount:     '0x3e8',
    }
    if (pageKey) params.pageKey = pageKey

    const result = await rpc(rpcUrl, 'alchemy_getAssetTransfers', [params]) as {
      transfers?: RawTransfer[]; pageKey?: string
    } | null
    if (!result?.transfers) break
    all.push(...result.transfers)
    pageKey = result.pageKey
    if (!pageKey) break
  }
  return all
}

// Confirm the mistake shape: tx was a DIRECT transfer() call on the token.
// Confirm the mistake shape: tx was a DIRECT transfer() call on the token
// AND the recipient typed into the calldata is the flagged contract.
// Fee-on-transfer ("tax") tokens emit a side-effect Transfer(user → token
// contract) on every ordinary transfer. In a genuine fat-finger the user
// literally entered the contract address as the recipient — so the calldata
// recipient must equal the event's `to`.
async function isDirectTransfer(
  txHash: string, wallet: string, tokenAddress: string,
  eventRecipient: string, chain: Chain
): Promise<boolean> {
  const tx = await rpc(getRpcUrl(chain), 'eth_getTransactionByHash', [txHash]) as {
    from?: string; to?: string; input?: string
  } | null
  if (!tx?.input || !tx.to || !tx.from) return false
  const input = tx.input.toLowerCase()
  if (
    tx.from.toLowerCase() !== wallet ||
    tx.to.toLowerCase()   !== tokenAddress ||
    !input.startsWith(TRANSFER_SELECTOR)
  ) return false

  // transfer(address,uint256): selector(4) + recipient(32) + amount(32).
  // Recipient occupies hex chars 34–74 (last 20 bytes of the first word).
  if (input.length < 74) return false
  const calldataRecipient = '0x' + input.slice(34, 74)
  return calldataRecipient === eventRecipient
}

// balanceOf(recipient) on the token — what the contract still holds
async function currentBalance(
  token: string, holder: string, chain: Chain
): Promise<string | null> {
  const data = '0x70a08231' + holder.slice(2).toLowerCase().padStart(64, '0')
  const result = await rpc(getRpcUrl(chain), 'eth_call', [{ to: token, data }, 'latest'])
  return typeof result === 'string' && result !== '0x' ? result : null
}

export async function scanVictimWallet(
  walletAddress: string, chain: Chain
): Promise<VictimScanResult> {
  const wallet = walletAddress.toLowerCase()

  // Step 1: outgoing transfer history
  const transfers = await getOutgoingTransfers(wallet, chain)

  // Step 2: candidate set — recipient is a token contract the wallet has
  // interacted with, the transferred token's own contract, or any KNOWN
  // major token contract (SYMBOL_MAP). Without the known-token seed, a
  // send to a token the wallet never transferred before would be invisible.
  const tokenContracts = new Set<string>(Object.keys(SYMBOL_MAP))
  for (const t of transfers) {
    const addr = t.rawContract?.address?.toLowerCase()
    if (addr) tokenContracts.add(addr)
  }

  const candidates = transfers.filter(t => {
    const to = t.to?.toLowerCase()
    return !!to && tokenContracts.has(to)
  }).slice(0, MAX_FINDINGS)

  // Step 3: verify each candidate — direct transfer() whose CALLDATA
  // recipient is the token contract (excludes tax-token side effects)
  const verified: RawTransfer[] = []
  for (const t of candidates) {
    const tokenAddr = t.rawContract?.address?.toLowerCase()
    const eventTo   = t.to?.toLowerCase()
    if (!tokenAddr || !eventTo) continue
    const ok = await isDirectTransfer(t.hash, wallet, tokenAddr, eventTo, chain)
    if (ok) verified.push(t)
  }

  if (verified.length === 0) {
    return { wallet, chain, findings: [], totalLostUsd: 0 }
  }

  // Step 4: enrich — prices, metadata, still-held balances
  const uniqueTokens = [...new Set(
    verified.map(t => t.rawContract!.address!.toLowerCase())
  )]
  const prices = await fetchPricesByAddress(uniqueTokens, chain)

  const metaMap: Record<string, { name: string; symbol: string; decimals: number }> = {}
  await Promise.allSettled(uniqueTokens.map(async addr => {
    const m = await getTokenMetadata(addr, chain)
    if (m) metaMap[addr] = m
  }))

  // Step 5: triage unique recipient contracts (bounded — Etherscan budget)
  const uniqueRecipients = [...new Set(verified.map(t => t.to!.toLowerCase()))]
  const triageMap: Record<string, {
    status: TriageStatus; rescueName?: string; name?: string
  }> = {}

  for (const recipient of uniqueRecipients.slice(0, MAX_TRIAGED)) {
    try {
      const scan = await scanContract(recipient, chain)
      let rescueName: string | undefined
      if (scan.triageStatus === 'recoverable') {
        // surface the rescue function name for the outreach message
        const { abi } = await fetchAbi(
          scan.implementationAddress || recipient, chain
        )
        if (abi) rescueName = detectRescueFunction(abi).functionName
      }
      triageMap[recipient] = {
        status:     scan.triageStatus,
        rescueName,
        name:       scan.tokenName,
      }
    } catch { /* leave untriaged */ }
  }

  // Step 6: build findings
  const findings: VictimFinding[] = []
  for (const t of verified) {
    const tokenAddr = t.rawContract!.address!.toLowerCase()
    const recipient = t.to!.toLowerCase()
    const meta      = metaMap[tokenAddr]
    const priceUsd  = prices[tokenAddr] || 0
    const amountNum = t.value ?? 0

    const heldRaw = await currentBalance(tokenAddr, recipient, chain)
    const held    = heldRaw && meta
      ? formatBalance(heldRaw, meta.decimals)
      : '?'

    findings.push({
      txHash:             t.hash,
      timestamp:          t.metadata?.blockTimestamp,
      tokenAddress:       tokenAddr,
      tokenSymbol:        meta?.symbol || t.asset || '???',
      tokenName:          meta?.name   || 'Unknown Token',
      amount:             amountNum.toString(),
      valueUsd:           amountNum * priceUsd,
      recipientContract:  recipient,
      recipientName:      triageMap[recipient]?.name,
      sentToSelf:         recipient === tokenAddr,
      contractStillHolds: held,
      triageStatus:       triageMap[recipient]?.status,
      rescueFunction:     triageMap[recipient]?.rescueName,
    })
  }

  const meaningful = findings.filter(f => f.valueUsd > 0)
  meaningful.sort((a, b) => b.valueUsd - a.valueUsd)
  const totalLostUsd = meaningful.reduce((s, f) => s + f.valueUsd, 0)

  console.log(
    `[victim] ${chain}:${wallet} → transfers=${transfers.length} candidates=${candidates.length} verified=${verified.length} kept=${meaningful.length}`
  )

  return { wallet, chain, findings: meaningful, totalLostUsd }
}