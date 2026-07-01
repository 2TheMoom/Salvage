import { Chain, StrandedToken } from '@/types'

const ALCHEMY_NETWORK: Record<Chain, string> = {
  eth:  'eth-mainnet',
  base: 'base-mainnet',
}

// ── Known symbol map for major tokens
// These tokens are priced by symbol (CEX+DEX) on Alchemy — far more reliable
// for mainstream assets than by-address (DEX only)
const SYMBOL_MAP: Record<string, string> = {
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

// ── Step 1: All ERC-20 balances
async function getAllTokenBalances(
  address: string,
  chain: Chain
): Promise<Array<{ contractAddress: string; tokenBalance: string }>> {
  const rpc = getRpcUrl(chain)
  try {
    const res = await fetch(rpc, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method:  'alchemy_getTokenBalances',
        params:  [address, 'erc20'],
      }),
    })
    const data = await res.json()
    if (!data.result?.tokenBalances) return []
    return data.result.tokenBalances.filter(
      (t: { tokenBalance: string | null }) => {
        if (!t.tokenBalance) return false
        try { return BigInt(t.tokenBalance) > 0n } catch { return false }
      }
    )
  } catch { return [] }
}

// ── Step 2: Token metadata
async function getTokenMetadata(
  tokenAddress: string,
  chain: Chain
): Promise<{ name: string; symbol: string; decimals: number } | null> {
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
    const { name, symbol, decimals } = data.result
    if (decimals === null || decimals === undefined || decimals < 0) return null
    return {
      name:     name     || 'Unknown Token',
      symbol:   symbol   || '???',
      decimals: decimals || 18,
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
    const chunk     = unique.slice(i, i + 25)
    const symbolStr = chunk.join(',')
    try {
      const res = await fetch(
        `https://api.g.alchemy.com/prices/v1/${apiKey}/tokens/by-symbol?symbols=${symbolStr}`,
        { headers: { 'Content-Type': 'application/json' }, cache: 'no-store' }
      )
      if (!res.ok) continue
      const data = await res.json()
      if (!data.data) continue
      for (const item of data.data) {
        if (item.error) continue
        const price = item.prices?.[0]?.value
        if (price && item.symbol) {
          prices[item.symbol.toUpperCase()] = parseFloat(price)
        }
      }
    } catch { /* continue */ }
  }
  return prices
}

// ── Step 3b: Price by ADDRESS — for unknown/long-tail tokens (DEX data)
async function fetchPricesByAddress(
  tokenAddresses: string[],
  chain: Chain
): Promise<Record<string, number>> {
  if (tokenAddresses.length === 0) return {}
  const apiKey  = getApiKey()
  const network = ALCHEMY_NETWORK[chain]
  const prices: Record<string, number> = {}

  for (let i = 0; i < tokenAddresses.length; i += 25) {
    const chunk     = tokenAddresses.slice(i, i + 25)
    const addresses = chunk.map(addr => ({ network, address: addr }))
    try {
      const res = await fetch(
        `https://api.g.alchemy.com/prices/v1/${apiKey}/tokens/by-address`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses }),
        }
      )
      if (!res.ok) continue
      const data = await res.json()
      if (!data.data) continue
      for (const item of data.data) {
        if (item.error) continue
        const price = item.prices?.[0]?.value
        if (price && item.address) {
          prices[item.address.toLowerCase()] = parseFloat(price)
        }
      }
    } catch { /* continue */ }
  }
  return prices
}

// ── Format hex balance
function formatBalance(rawHex: string, decimals: number): string {
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

  // Step 1: All ERC-20 balances
  const balances = await getAllTokenBalances(address, chain)
  if (balances.length === 0) return []

  // Step 2: Metadata in parallel batches
  const withMetadata: Array<{
    tokenAddress: string
    rawBalance:   string
    name:         string
    symbol:       string
    decimals:     number
  }> = []

  for (let i = 0; i < balances.length; i += 10) {
    const batch   = balances.slice(i, i + 10)
    const results = await Promise.allSettled(
      batch.map(b => getTokenMetadata(b.contractAddress, chain))
    )
    for (let j = 0; j < batch.length; j++) {
      const meta = results[j]
      if (meta.status === 'fulfilled' && meta.value) {
        withMetadata.push({
          tokenAddress: batch[j].contractAddress.toLowerCase(),
          rawBalance:   batch[j].tokenBalance,
          name:         meta.value.name,
          symbol:       meta.value.symbol,
          decimals:     meta.value.decimals,
        })
      }
    }
  }

  if (withMetadata.length === 0) return []

  // Step 3: Hybrid pricing
  // Split tokens into: known (use by-symbol) and unknown (use by-address)
  const knownTokens:   typeof withMetadata = []
  const unknownTokens: typeof withMetadata = []

  for (const token of withMetadata) {
    if (SYMBOL_MAP[token.tokenAddress]) {
      knownTokens.push(token)
    } else {
      unknownTokens.push(token)
    }
  }

  // Fetch prices for known tokens by symbol
  const knownSymbols  = knownTokens.map(t => SYMBOL_MAP[t.tokenAddress])
  const symbolPrices  = await fetchPricesBySymbol(knownSymbols)

  // Fetch prices for unknown tokens by address
  const unknownAddrs  = unknownTokens.map(t => t.tokenAddress)
  const addressPrices = await fetchPricesByAddress(unknownAddrs, chain)

  // Step 4: Build results
  const stranded: StrandedToken[] = withMetadata.map(token => {
    let priceUsd = 0

    if (SYMBOL_MAP[token.tokenAddress]) {
      // Known token — use symbol price
      const sym = SYMBOL_MAP[token.tokenAddress].toUpperCase()
      priceUsd  = symbolPrices[sym] ?? 0
    } else {
      // Unknown token — use address price
      priceUsd = addressPrices[token.tokenAddress] ?? 0
    }

    const balanceFormatted = formatBalance(token.rawBalance, token.decimals)
    const balanceNum       = parseFloat(balanceFormatted) || 0
    const valueUsd         = balanceNum * priceUsd

    return {
      tokenAddress:    token.tokenAddress,
      tokenName:       token.name,
      tokenSymbol:     token.symbol,
      balance:         BigInt(token.rawBalance).toString(),
      balanceFormatted,
      priceUsd,
      valueUsd,
    }
  })

  // Step 5: Filter out $0 value tokens (spam), sort by value desc
  return stranded
    .filter(t => t.valueUsd > 0)
    .sort((a, b) => b.valueUsd - a.valueUsd)
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