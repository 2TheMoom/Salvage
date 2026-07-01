import { ScanResult } from '@/types'

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(2)}`
}

export function generateOutreachTemplate(result: ScanResult): string {
  const chainName    = result.chain === 'eth' ? 'Ethereum' : 'Base'
  const explorerBase = result.chain === 'eth' ? 'https://etherscan.io' : 'https://basescan.org'
  const explorerLink = `${explorerBase}/address/${result.contractAddress}`
  const totalUsd     = result.totalStrandedUsd ?? 0
  const feeUsd       = result.finderFeeUsd     ?? 0

  const tokenLines = result.strandedTokens && result.strandedTokens.length > 0
    ? result.strandedTokens
        .filter(t => t.valueUsd > 0)
        .slice(0, 5)
        .map(t => `  • ${t.balanceFormatted} ${t.tokenSymbol} ≈ ${formatUsd(t.valueUsd)}`)
        .join('\n')
    : '  • Token balances detected — full breakdown available'

  const recoveryNote = result.triageStatus === 'recoverable'
    ? `The contract ABI contains a rescue/recovery function that can be called directly by the owner with no upgrade required.`
    : `The contract uses a proxy pattern and an upgrade path exists. Adding a rescue function via the ProxyAdmin would allow recovery.`

  return `Subject: ${formatUsd(totalUsd)} in tokens stranded in your contract — recoverable

Hi [Team Name],

I'm reaching out about stranded token balances sitting inside your contract on ${chainName}.

CONTRACT: ${result.contractAddress}
Explorer: ${explorerLink}

STRANDED TOKENS (${formatUsd(totalUsd)} total):
${tokenLines}

${recoveryNote}

I discovered this using Salvage (salvage-olive.vercel.app), an EVM stranded asset intelligence tool. My find has been registered on-chain with a timestamp proving discovery.

I'm not asking for anything upfront — if you choose to recover these tokens, a 7% finder's fee (${formatUsd(feeUsd)}) would route to my wallet automatically via the Salvage fee contract. The remaining 93% goes back to your treasury or designated wallet.

Happy to provide the full recovery calldata and step-by-step instructions if you'd like to proceed.

Best,
[Your Name / ENS / Handle]

---
Salvage Protocol · Find it. Claim it. Recover it.
salvage-olive.vercel.app`.trim()
}