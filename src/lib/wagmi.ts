import { createConfig, http } from 'wagmi'
import { mainnet, base } from 'wagmi/chains'
import { injected, coinbaseWallet, walletConnect } from '@wagmi/connectors'

// Needed for mobile browser users with no extension and no Coinbase Wallet
// app — WalletConnect's modal handles QR pairing and same-device deep links
// into whatever wallet (Trust, Rainbow, MetaMask mobile, etc.) they already have.
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

export const config = createConfig({
  chains: [mainnet, base],
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'Salvage' }),
    ...(walletConnectProjectId
      ? [walletConnect({
          projectId: walletConnectProjectId,
          metadata: {
            name: 'Salvage',
            description: 'Recover ERC-20 tokens stranded in smart contracts',
            url: 'https://usesalvage.xyz',
            icons: ['https://usesalvage.xyz/icon-512.png'],
          },
          showQrModal: true,
        })]
      : []),
  ],
  transports: {
    [mainnet.id]: http(process.env.NEXT_PUBLIC_ALCHEMY_ETH_RPC),
    [base.id]:    http(process.env.NEXT_PUBLIC_ALCHEMY_BASE_RPC),
  },
})