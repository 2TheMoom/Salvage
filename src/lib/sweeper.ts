import { Chain, StrandedToken } from '@/types'

const ALCHEMY_NETWORK: Record<Chain, string> = {
  eth:  'eth-mainnet',
  base: 'base-mainnet',
}

// ── Known symbol map for major tokens
// These tokens are priced by symbol (CEX+DEX) on Alchemy — far more reliable
// for mainstream assets than by-address (DEX only)
export const SYMBOL_MAP: Record<string, string> = {
  // ETH ecosystem
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'WBTC',
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',
  '0x514910771af9ca656af840dff83e8264ecf986ca': 'LINK',
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': 'UNI',
  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': 'AAVE',
  '0xc944e90c64b2c07662a292be6244bdf05cda44a7': 'GRT',
  '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2': 'MKR',
  '0xd533a949740bb3306d119cc777fa900ba034cd52': 'CRV',
  '0xc00e94cb662c3520282e6f5717214004a7f26888': 'COMP',
  '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e': 'YFI',
  '0x6b175474e89094c44da98b954eedeac495271d0f': 'DAI',
  '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0': 'MATIC',
  '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce': 'SHIB',
  '0x853d955acef822db058eb8505911ed77f175b99e': 'FRAX',
  '0x5a98fcbea516cf06857215779fd812ca3bef1b32': 'LDO',
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': 'STETH',
  '0x111111111117dc0aa78b770fa6a738034120c302': '1INCH',
  '0xba100000625a3754423978a60c9317c58a424e3d': 'BAL',
  '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f': 'SNX',
  '0xe41d2489571d322189246dafa5ebde1f4699f498': 'ZRX',
  '0x4d224452801aced8b2f0aebe155379bb5d594381': 'APE',
  '0x6de037ef9ad2725eb40118bb1702ebb27e4aeb24': 'RNDR',
  '0x1abaea1f7c830bd89acc67ec4af516284b1bc33c': 'EUROC',
  '0x4fabb145d64652a948d72533023f6e7a623c7c53': 'BUSD',
  '0x0f5d2fb29fb7d3cfee444a200298f468908cc942': 'MANA',
  '0x808507121b80c02388fad14726482e061b8da827': 'PENDLE',
  '0xfaba6f8e4a5e8ab82f62fe7c39859fa577269be3': 'ONDO',
  '0x0d8775f648430679a709e98d2b0cb6250d2887ef': 'BAT',
  // Base ecosystem
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC',
  '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': 'USDC',
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 'DAI',
  '0x4200000000000000000000000000000000000006': 'WETH',
  '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22': 'ETH',
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': 'USDT',
  '0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452': 'WSTETH',
  '0x940181a94a35a4569e4529a3cdfb74e38fd98631': 'AERO',
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': 'WBTC',
  '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42': 'EURC',
  '0x236aa50979d5f3de3bd1eeb40e81137f22ab794b': 'TBTC',
}

function getRpcUrl(chain: Chain): string {
  if (chain === 'eth')  return process.env.ALCHEMY_ETH_RPC!
  if (chain === 'base') return process.env.ALCHEMY_BASE_RPC!
  throw new Error(`Unknown chain: ${chain}`)
}

function getApiKey(): string {
  return process.env.ALCHEMY_API_KEY!
}

// ── Step 1: All ERC-20 balances — PAGINATED.
// alchemy_getTokenBalances returns ~100 tokens per page ordered by contract
// address. Contracts like USDC hold hundreds of dust tokens, so without
// following pageKey, anything above ~0x0f... (USDT at 0xdac1..., DAI at
// 0x6b17...) is never even discovered.
async function getAllTokenBalances(
  address: string,
  chain: Chain
): Promise<Array<{ contractAddress: string; tokenBalance: string }>> {
  const rpc = getRpcUrl(chain)
  const all: Array<{ contractAddress: string; tokenBalance: string }> = []
  let pageKey: string | undefined
  const MAX_PAGES = 20 // up to ~2000 token contracts

  for (let page = 0; page < MAX_PAGES; page++) {
    let data: { result?: { tokenBalances?: Array<{ tokenBalance: string | null }>; pageKey?: string }; error?: { code: number } } | null = null

    // Up to 4 attempts per page — 429s from the shared free tier are
    // transient and usually clear within a second.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 10000)
        const res = await fetch(rpc, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method:  'alchemy_getTokenBalances',
            params:  pageKey ? [address, 'erc20', { pageKey }] : [address, 'erc20'],
          }),
          signal: ctrl.signal,
        })
        clearTimeout(timer)
        const json = await res.json()
        if (res.status === 429 || json.error?.code === 429) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1))) // 0.5s,1s,1.5s,2s
          continue
        }
        data = json
        break
      } catch {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
      }
    }

    const balances = data?.result?.tokenBalances
    if (!balances) break

    for (const t of balances) {
      if (!t.tokenBalance) continue
      try { if (BigInt(t.tokenBalance) > 0n) all.push(t as { contractAddress: string; tokenBalance: string }) } catch { /* skip */ }
    }

    pageKey = data?.result?.pageKey
    if (!pageKey) break
  }
  return all
}

// ── Step 1b: GUARANTEED known-token pass.
// Discovery pagination can be exhausted by spam before reaching high
// addresses (USDT at 0xdac1... on the USDC contract). This explicit
// balance check on every SYMBOL_MAP token makes majors impossible to miss.
async function getKnownTokenBalances(
  address: string,
  chain: Chain
): Promise<Array<{ contractAddress: string; tokenBalance: string }>> {
  const rpc = getRpcUrl(chain)
  const knownAddrs = Object.keys(SYMBOL_MAP)
  const out: Array<{ contractAddress: string; tokenBalance: string }> = []

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 10000)
      const res = await fetch(rpc, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method:  'alchemy_getTokenBalances',
          params:  [address, knownAddrs],
        }),
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      const data = await res.json()
      if (res.status === 429 || data.error?.code === 429) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
        continue
      }
      for (const t of data.result?.tokenBalances || []) {
        if (!t.tokenBalance) continue
        try { if (BigInt(t.tokenBalance) > 0n) out.push(t) } catch { /* skip */ }
      }
      break
    } catch {
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  return out
}

// ── Step 2: Token metadata
export async function getTokenMetadata(
  tokenAddress: string,
  chain: Chain
): Promise<{ name: string; symbol: string; decimals: number; logo: string | null } | null> {
  const rpc = getRpcUrl(chain)
  try {
    const res = await fetch(rpc, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method:  'alchemy_getTokenMetadata',
        params:  [tokenAddress],
      }),
    })
    const data = await res.json()
    if (!data.result) return null
    const { name, symbol, decimals, logo } = data.result
    if (decimals === null || decimals === undefined || decimals < 0) return null
    return {
      name:     name     || 'Unknown Token',
      symbol:   symbol   || '???',
      decimals: decimals || 18,
      logo:     logo     || null,
    }
  } catch { return null }
}

// ── Step 3a: Price by SYMBOL — for known major tokens (CEX + DEX data)
async function fetchPricesBySymbol(
  symbols: string[]
): Promise<Record<string, number>> {
  if (symbols.length === 0) return {}
  const apiKey = getApiKey()
  const unique = [...new Set(symbols)]
  const prices: Record<string, number> = {}

  // Batch into 25
  for (let i = 0; i < unique.length; i += 25) {
    const chunk = unique.slice(i, i + 25)
    // Alchemy expects REPEATED params: ?symbols=USDT&symbols=WBTC&...
    // A comma-joined list is rejected and returns no prices.
    const params = new URLSearchParams()
    chunk.forEach(s => params.append('symbols', s))
    // Retry with backoff — bursts of scans can hit Alchemy throughput
    // limits (429). A throttled pricing call must never zero out majors.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 8000)
        const res = await fetch(
          `https://api.g.alchemy.com/prices/v1/${apiKey}/tokens/by-symbol?${params.toString()}`,
          { headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal: ctrl.signal }
        )
        clearTimeout(timer)
        if (!res.ok) {
          // Only a rate-limit (429) is worth retrying. Any other failure
          // won't recover — bail immediately so we don't burn the timeout.
          if (res.status === 429) { await new Promise(r => setTimeout(r, 500)); continue }
          break
        }
        const data = await res.json()
        for (const item of data.data || []) {
          if (item.error) continue
          const price = item.prices?.[0]?.value
          if (price && item.symbol) {
            prices[item.symbol.toUpperCase()] = parseFloat(price)
          }
        }
        break
      } catch {
        break // timeout or network error — stablecoin floor will cover majors
      }
    }
  }
  return prices
}

// ── Step 3b: Price by ADDRESS — for unknown/long-tail tokens (DEX data)
export async function fetchPricesByAddress(
  tokenAddresses: string[],
  chain: Chain
): Promise<Record<string, number>> {
  if (tokenAddresses.length === 0) return {}
  const apiKey  = getApiKey()
  const network = ALCHEMY_NETWORK[chain]
  const prices: Record<string, number> = {}

  // Build all 25-address batches, then run them with a concurrency pool
  // of 5 — hundreds of tokens must price within the function timeout.
  const batches: string[][] = []
  for (let i = 0; i < tokenAddresses.length; i += 25) {
    batches.push(tokenAddresses.slice(i, i + 25))
  }

  const runBatch = async (chunk: string[]) => {
    const addresses = chunk.map(addr => ({ network, address: addr }))
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 8000)
        const res = await fetch(
          `https://api.g.alchemy.com/prices/v1/${apiKey}/tokens/by-address`,
          {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addresses }),
            signal: ctrl.signal,
          }
        )
        clearTimeout(timer)
        if (!res.ok) {
          if (res.status === 429) { await new Promise(r => setTimeout(r, 500)); continue }
          return
        }
        const data = await res.json()
        for (const item of data.data || []) {
          if (item.error) continue
          const price = item.prices?.[0]?.value
          if (price && item.address) {
            prices[item.address.toLowerCase()] = parseFloat(price)
          }
        }
        return
      } catch {
        return // timeout or network error — don't stall the whole sweep
      }
    }
  }

  const POOL = 5
  for (let i = 0; i < batches.length; i += POOL) {
    await Promise.allSettled(batches.slice(i, i + POOL).map(runBatch))
  }
  return prices
}

// ── Format hex balance
export function formatBalance(rawHex: string, decimals: number): string {
  try {
    const raw     = BigInt(rawHex)
    if (raw === 0n) return '0'
    const divisor  = 10n ** BigInt(decimals)
    const whole    = raw / divisor
    const fraction = raw % divisor
    if (fraction === 0n) return whole.toString()
    const fracStr = fraction.toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '')
    return fracStr ? `${whole}.${fracStr}` : whole.toString()
  } catch { return '0' }
}

// ── Master sweep
export async function sweepTokenBalances(
  contractAddress: string,
  chain: Chain
): Promise<StrandedToken[]> {
  const address = contractAddress.toLowerCase()

  // Step 1: Discovery (paginated) + guaranteed known-token pass, merged
  const [discovered, guaranteed] = await Promise.all([
    getAllTokenBalances(address, chain),
    getKnownTokenBalances(address, chain),
  ])
  const seen = new Set<string>()
  const balances: Array<{ contractAddress: string; tokenBalance: string }> = []
  for (const b of [...guaranteed, ...discovered]) {
    const key = b.contractAddress.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    balances.push(b)
  }
  if (balances.length === 0) return []

  // Step 2: Price FIRST, metadata second.
  // With pagination we may discover hundreds of tokens — fetching metadata
  // for all of them would blow the function timeout. Prices identify the
  // handful with real value; metadata is then fetched only for those.
  const addrs = balances.map(b => b.contractAddress.toLowerCase())

  const knownAddrs   = addrs.filter(a => SYMBOL_MAP[a])
  const knownSymbols = knownAddrs.map(a => SYMBOL_MAP[a])

  const [symbolPrices, addressPrices] = await Promise.all([
    fetchPricesBySymbol(knownSymbols),
    fetchPricesByAddress(addrs, chain), // all addresses — known ones double as fallback
  ])

  // Stablecoin price floor — $1 by definition. If the Alchemy Prices API
  // is down or quota-blocked, majors must still price correctly. USDT alone
  // is the bulk of most stranded pools.
  const STABLE_USD: Record<string, number> = {
    USDC: 1, USDT: 1, DAI: 1, FRAX: 1, BUSD: 1, EUROC: 1.08, GUSD: 1, TUSD: 1, USDP: 1, LUSD: 1,
  }

  const priceFor = (addr: string): number => {
    if (SYMBOL_MAP[addr]) {
      const sym = SYMBOL_MAP[addr].toUpperCase()
      return symbolPrices[sym] || addressPrices[addr] || STABLE_USD[sym] || 0
    }
    return addressPrices[addr] || 0
  }

  // Step 3: Keep only tokens with a real price, then fetch their metadata
  const priced = balances
    .map(b => ({
      tokenAddress: b.contractAddress.toLowerCase(),
      rawBalance:   b.tokenBalance,
      priceUsd:     priceFor(b.contractAddress.toLowerCase()),
    }))
    .filter(t => t.priceUsd > 0)

  // Diagnostic BEFORE the fatal early-return, so pricing failures are never
  // invisible again. If discovered>0 but priced=0, the Prices API is failing.
  if (priced.length === 0) {
    console.error(
      `[sweep-empty] ${chain}:${address} → discovered=${balances.length} symbolPrices=${Object.keys(symbolPrices).length} addressPrices=${Object.keys(addressPrices).length} — pricing returned nothing`
    )
    return []
  }

  const withMetadata: Array<{
    tokenAddress: string
    rawBalance:   string
    priceUsd:     number
    name:         string
    symbol:       string
    decimals:     number
  }> = []

  for (let i = 0; i < priced.length; i += 10) {
    const batch   = priced.slice(i, i + 10)
    const results = await Promise.allSettled(
      batch.map(t => getTokenMetadata(t.tokenAddress, chain))
    )
    for (let j = 0; j < batch.length; j++) {
      const meta = results[j]
      if (meta.status !== 'fulfilled' || !meta.value) continue
      const token = batch[j]
      const balanceNum = parseFloat(formatBalance(token.rawBalance, meta.value.decimals)) || 0
      const estimatedValueUsd = balanceNum * token.priceUsd
      // VERIFIED FILTER: a real Alchemy logo is one signal of legitimacy, but
      // requiring it outright was dropping genuine tokens that simply aren't
      // in Alchemy's curated set — that's how real value went missing. Below
      // a small threshold, still require the logo (screens out thin-liquidity
      // spam with manipulated fake prices, which is only actually a nuisance
      // at low dollar amounts); above it, trust the priced value regardless —
      // faking a *high* on-chain price requires real capital locked in the
      // pool, which defeats the point of a cheap spam attack.
      const LOGO_REQUIRED_BELOW_USD = 25
      if (!SYMBOL_MAP[token.tokenAddress] && !meta.value.logo && estimatedValueUsd < LOGO_REQUIRED_BELOW_USD) continue
      const { logo: _logo, ...metaFields } = meta.value
      withMetadata.push({ ...token, ...metaFields })
    }
  }

  // Step 4: Build results
  const stranded: StrandedToken[] = withMetadata.map(token => {
    const balanceFormatted = formatBalance(token.rawBalance, token.decimals)
    const balanceNum       = parseFloat(balanceFormatted) || 0
    const valueUsd         = balanceNum * token.priceUsd

    return {
      tokenAddress:    token.tokenAddress,
      tokenName:       token.name,
      tokenSymbol:     token.symbol,
      balance:         BigInt(token.rawBalance).toString(),
      balanceFormatted,
      priceUsd:        token.priceUsd,
      valueUsd,
    }
  })

  // Step 5: Filter out $0 value tokens (spam), sort by value desc
  const final = stranded
    .filter(t => t.valueUsd > 0)
    .sort((a, b) => b.valueUsd - a.valueUsd)

  console.log(
    `[sweep] ${chain}:${address} → discovered=${balances.length} priced=${priced.length} verified=${withMetadata.length} final=${final.length}`
  )
  return final
}

// ── Totals
export function calcTotals(tokens: StrandedToken[]): {
  totalStrandedUsd: number
  finderFeeUsd:     number
} {
  const totalStrandedUsd = tokens.reduce((sum, t) => sum + t.valueUsd, 0)
  const finderFeeUsd     = totalStrandedUsd * 0.07
  return { totalStrandedUsd, finderFeeUsd }
}