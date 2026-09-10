import { Chain } from '@/types'

export type DexEntryKind = 'pool' | 'router'

export interface DexRegistryEntry {
  address: string   // lowercase
  chain: Chain
  kind: DexEntryKind
  dexName: string
}

// Flat, hardcoded, comment-partitioned by chain — same convention as
// SYMBOL_MAP in sweeper.ts. No live factory/registry lookups here; every
// address below has been independently verified against on-chain ground
// truth (either the factory contract's own getPair(), or Etherscan/Basescan
// contract-name data), not trusted from memory or a single scraped source.
// No Arc entries — zero DEX presence there until mainnet launches.
export const DEX_REGISTRY: DexRegistryEntry[] = [
  // ── ETH ecosystem ──
  {
    address: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d',
    chain: 'eth', kind: 'router', dexName: 'Uniswap V2 Router02',
  },
  {
    address: '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc',
    chain: 'eth', kind: 'pool', dexName: 'Uniswap V2: WETH/USDC',
  },

  // ── Base ecosystem ──
  {
    address: '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',
    chain: 'base', kind: 'router', dexName: 'Uniswap V2 Router02',
  },
  {
    address: '0x88a43bbdf9d098eec7bceda4e2494615dfd9bb9c',
    chain: 'base', kind: 'pool', dexName: 'Uniswap V2: WETH/USDC',
  },
]

export function poolAddressesForChain(chain: Chain): string[] {
  return DEX_REGISTRY.filter((e) => e.chain === chain && e.kind === 'pool').map((e) => e.address)
}

export function routerAddressesForChain(chain: Chain): string[] {
  return DEX_REGISTRY.filter((e) => e.chain === chain && e.kind === 'router').map((e) => e.address)
}

export function lookupDexEntry(address: string, chain: Chain): DexRegistryEntry | undefined {
  const lower = address.toLowerCase()
  return DEX_REGISTRY.find((e) => e.chain === chain && e.address === lower)
}
