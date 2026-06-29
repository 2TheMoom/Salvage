// Validate Ethereum address format
export function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address)
}

// Truncate address for display: 0x1234…5678
export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`
}

// Etherscan/Basescan URL for a given chain
export function explorerUrl(address: string, chain: 'eth' | 'base'): string {
  const base = chain === 'eth' ? 'https://etherscan.io' : 'https://basescan.org'
  return `${base}/address/${address}`
}