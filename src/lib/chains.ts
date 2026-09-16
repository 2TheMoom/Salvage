import { defineChain } from 'viem'

// Arc is too new to be in viem/chains yet — defined here once, shared by
// wagmi.ts (wallet connection) and contracts.ts (server-side reads).
// Mainnet values confirmed directly against Circle's own docs
// (docs.arc.io/arc/references/connect-to-arc.md) after Arc's Sept 16, 2026
// mainnet launch — not carried over from testnet assumptions.
export const arc = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' },
  },
  testnet: false,
})
