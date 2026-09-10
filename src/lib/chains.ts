import { defineChain } from 'viem'

// Arc is too new to be in viem/chains yet — defined here once, shared by
// wagmi.ts (wallet connection) and contracts.ts (server-side reads).
// TODO: add/swap to an `arc` mainnet definition once Arc's mainnet chain ID
// and RPC are confirmed (launch: Sept 16, 2026) — this is testnet only.
export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'Arcscan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
})
