// Validate Ethereum address format
export function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address)
}

// Truncate address for display: 0x1234…5678
export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`
}

// Etherscan/Basescan/Arcscan URL for a given chain
// TODO: swap to mainnet Arcscan URL once published (Sept 16 launch)
export function explorerUrl(address: string, chain: 'eth' | 'base' | 'arc'): string {
  const base = chain === 'eth' ? 'https://etherscan.io'
    : chain === 'base' ? 'https://basescan.org'
    : 'https://testnet.arcscan.app'
  return `${base}/address/${address}`
}