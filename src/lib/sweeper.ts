import { Chain, StrandedToken } from '@/types'

// ── Top 20 ERC-20 tokens to sweep on each chain
// Each entry: { address, symbol, name, decimals, coingeckoId }
const ETH_TOKENS = [
  { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC',  name: 'USD Coin',          decimals: 6,  coingeckoId: 'usd-coin'       },
  { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT',  name: 'Tether USD',         decimals: 6,  coingeckoId: 'tether'          },
  { address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', symbol: 'WBTC',  name: 'Wrapped Bitcoin',    decimals: 8,  coingeckoId: 'wrapped-bitcoin' },
  { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', symbol: 'WETH',  name: 'Wrapped Ether',      decimals: 18, coingeckoId: 'weth'            },
  { address: '0x514910771af9ca656af840dff83e8264ecf986ca', symbol: 'LINK',  name: 'Chainlink',          decimals: 18, coingeckoId: 'chainlink'       },
  { address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', symbol: 'UNI',   name: 'Uniswap',            decimals: 18, coingeckoId: 'uniswap'         },
  { address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', symbol: 'AAVE',  name: 'Aave',               decimals: 18, coingeckoId: 'aave'            },
  { address: '0xc944e90c64b2c07662a292be6244bdf05cda44a7', symbol: 'GRT',   name: 'The Graph',          decimals: 18, coingeckoId: 'the-graph'       },
  { address: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2', symbol: 'MKR',   name: 'Maker',              decimals: 18, coingeckoId: 'maker'           },
  { address: '0xd533a949740bb3306d119cc777fa900ba034cd52', symbol: 'CRV',   name: 'Curve DAO',          decimals: 18, coingeckoId: 'curve-dao-token' },
  { address: '0xc00e94cb662c3520282e6f5717214004a7f26888', symbol: 'COMP',  name: 'Compound',           decimals: 18, coingeckoId: 'compound-governance-token' },
  { address: '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e', symbol: 'YFI',   name: 'yearn.finance',      decimals: 18, coingeckoId: 'yearn-finance'   },
  { address: '0x6b175474e89094c44da98b954eedeac495271d0f', symbol: 'DAI',   name: 'Dai',                decimals: 18, coingeckoId: 'dai'             },
  { address: '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0', symbol: 'MATIC', name: 'Polygon',            decimals: 18, coingeckoId: 'matic-network'   },
  { address: '0x4fabb145d64652a948d72533023f6e7a623c7c53', symbol: 'BUSD',  name: 'Binance USD',        decimals: 18, coingeckoId: 'binance-usd'     },
  { address: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce', symbol: 'SHIB',  name: 'Shiba Inu',          decimals: 18, coingeckoId: 'shiba-inu'       },
  { address: '0x1abaea1f7c830bd89acc67ec4af516284b1bc33c', symbol: 'EUROC', name: 'Euro Coin',          decimals: 6,  coingeckoId: 'euro-coin'       },
  { address: '0x853d955acef822db058eb8505911ed77f175b99e', symbol: 'FRAX',  name: 'Frax',               decimals: 18, coingeckoId: 'frax'            },
  { address: '0x5a98fcbea516cf06857215779fd812ca3bef1b32', symbol: 'LDO',   name: 'Lido DAO',           decimals: 18, coingeckoId: 'lido-dao'        },
  { address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', symbol: 'stETH', name: 'Lido Staked ETH',   decimals: 18, coingeckoId: 'staked-ether'    },
]

const BASE_TOKENS = [
  { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC',  name: 'USD Coin',          decimals: 6,  coingeckoId: 'usd-coin'        },
  { address: '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', symbol: 'DAI',   name: 'Dai',               decimals: 18, coingeckoId: 'dai'             },
  { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH',  name: 'Wrapped Ether',     decimals: 18, coingeckoId: 'weth'            },
  { address: '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22', symbol: 'cbETH', name: 'Coinbase Wrapped ETH', decimals: 18, coingeckoId: 'coinbase-wrapped-staked-eth' },
  { address: '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca', symbol: 'USDbC', name: 'Bridged USDC',      decimals: 6,  coingeckoId: 'usd-coin'        },
  { address: '0x27d2decb4bfc9c76f0309b8e88dec3a601fe25a8', symbol: 'BALD',  name: 'Bald',              decimals: 18, coingeckoId: 'bald'            },
  { address: '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2', symbol: 'USDT',  name: 'Tether USD',        decimals: 6,  coingeckoId: 'tether'          },
  { address: '0x0a1d576f3efef75b330424287a95a366e8281d54', symbol: 'ANKR',  name: 'Ankr',              decimals: 18, coingeckoId: 'ankr'            },
  { address: '0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452', symbol: 'wstETH',name: 'Wrapped stETH',    decimals: 18, coingeckoId: 'wrapped-steth'   },
  { address: '0x78a087d713be963bf307b18f2ff8122ef9a63ae9', symbol: 'BSWAP', name: 'BaseSwap',          decimals: 18, coingeckoId: 'baseswap'        },
]

const CHAIN_TOKENS: Record<Chain, typeof ETH_TOKENS> = {
  eth:  ETH_TOKENS,
  base: BASE_TOKENS,
}

// ── balanceOf ABI — minimal, just what we need
const BALANCE_OF_ABI = '0x70a08231' // balanceOf(address) selector

// ── Call balanceOf on a single token contract
async function getTokenBalance(
  tokenAddress: string,
  walletAddress: string,
  rpcUrl: string
): Promise<bigint> {
  // Encode balanceOf(address) call
  const data = BALANCE_OF_ABI + walletAddress.slice(2).padStart(64, '0')

  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method:  'eth_call',
      params:  [{ to: tokenAddress, data }, 'latest'],
      id:      1,
    }),
  })

  const json = await res.json()
  if (!json.result || json.result === '0x') return 0n
  try {
    return BigInt(json.result)
  } catch {
    return 0n
  }
}

// ── Format raw balance using decimals
function formatBalance(raw: bigint, decimals: number): string {
  if (raw === 0n) return '0'
  const divisor  = 10n ** BigInt(decimals)
  const whole    = raw / divisor
  const fraction = raw % divisor
  if (fraction === 0n) return whole.toString()
  const fracStr  = fraction.toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '')
  return fracStr ? `${whole}.${fracStr}` : whole.toString()
}

// ── Fetch USD prices from CoinGecko free tier
async function fetchPrices(
  coingeckoIds: string[]
): Promise<Record<string, number>> {
  if (coingeckoIds.length === 0) return {}

  const unique = [...new Set(coingeckoIds)]
  const ids    = unique.join(',')
  const url    = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`

  try {
    const res  = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) return {}
    const data = await res.json() as Record<string, { usd: number }>

    const prices: Record<string, number> = {}
    for (const [id, val] of Object.entries(data)) {
      prices[id] = val.usd ?? 0
    }
    return prices
  } catch {
    return {}
  }
}

// ── Master sweep function
export async function sweepTokenBalances(
  contractAddress: string,
  chain: Chain
): Promise<StrandedToken[]> {
  const rpcUrl = chain === 'eth'
    ? process.env.ALCHEMY_ETH_RPC!
    : process.env.ALCHEMY_BASE_RPC!

  const tokens  = CHAIN_TOKENS[chain]
  const address = contractAddress.toLowerCase()

  // Step 1: Check all balances in parallel
  const balanceResults = await Promise.allSettled(
    tokens.map(token => getTokenBalance(token.address, address, rpcUrl))
  )

  // Step 2: Filter tokens that have a non-zero balance
  const tokensWithBalance = tokens
    .map((token, i) => {
      const result = balanceResults[i]
      const raw    = result.status === 'fulfilled' ? result.value : 0n
      return { ...token, raw }
    })
    .filter(t => t.raw > 0n)

  if (tokensWithBalance.length === 0) return []

  // Step 3: Fetch prices for tokens found
  const coingeckoIds = tokensWithBalance.map(t => t.coingeckoId)
  const prices       = await fetchPrices(coingeckoIds)

  // Step 4: Build StrandedToken objects
  const stranded: StrandedToken[] = tokensWithBalance.map(token => {
    const balanceFormatted = formatBalance(token.raw, token.decimals)
    const priceUsd         = prices[token.coingeckoId] ?? 0
    const balanceNum       = parseFloat(balanceFormatted)
    const valueUsd         = balanceNum * priceUsd

    return {
      tokenAddress:    token.address,
      tokenName:       token.name,
      tokenSymbol:     token.symbol,
      balance:         token.raw.toString(),
      balanceFormatted,
      priceUsd,
      valueUsd,
    }
  })

  // Step 5: Sort by USD value descending
  return stranded.sort((a, b) => b.valueUsd - a.valueUsd)
}

// ── Calculate totals from stranded token list
export function calcTotals(tokens: StrandedToken[]): {
  totalStrandedUsd: number
  finderFeeUsd: number
} {
  const totalStrandedUsd = tokens.reduce((sum, t) => sum + t.valueUsd, 0)
  const finderFeeUsd     = totalStrandedUsd * 0.07
  return { totalStrandedUsd, finderFeeUsd }
}