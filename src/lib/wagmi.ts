import { createConfig, http } from 'wagmi'
import { mainnet, base } from 'wagmi/chains'
import { injected, coinbaseWallet } from '@wagmi/connectors'

export const config = createConfig({
  chains: [mainnet, base],
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'Salvage' }),
  ],
  transports: {
    [mainnet.id]: http(process.env.NEXT_PUBLIC_ALCHEMY_ETH_RPC),
    [base.id]:    http(process.env.NEXT_PUBLIC_ALCHEMY_BASE_RPC),
  },
})