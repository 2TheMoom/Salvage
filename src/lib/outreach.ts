import { ScanResult } from '@/types'
import type { ResolvedIdentity } from '@/lib/identity'

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(2)}`
}

function greetingFor(identity?: ResolvedIdentity): string {
  if (identity?.farcaster) return `Hi @${identity.farcaster.username},`
  if (identity?.basename)  return `Hi ${identity.basename.name},`
  if (identity?.ens)       return `Hi ${identity.ens.name},`
  return 'Hi [Team Name],'
}

export function generateOutreachTemplate(result: ScanResult, ownerIdentity?: ResolvedIdentity): string {
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

${greetingFor(ownerIdentity)}

I'm reaching out about stranded token balances sitting inside your contract on ${chainName}.

CONTRACT: ${result.contractAddress}
Explorer: ${explorerLink}

STRANDED TOKENS (${formatUsd(totalUsd)} total):
${tokenLines}

${recoveryNote}

I discovered this using Salvage (usesalvage.xyz), an EVM stranded asset intelligence tool. My find has been registered on-chain with a timestamp proving discovery.

I'm not asking for anything upfront — if you choose to recover these tokens, a 7% finder's fee (${formatUsd(feeUsd)}) routes to my wallet automatically via Salvage's on-chain settlement contract, 3% goes to the protocol, and the remaining 90% goes back to your treasury or designated wallet. Nobody custodies your funds at any point.

You can see this contract's scan and recover it directly here — connecting the matching owner wallet unlocks a one-click recovery flow:
https://usesalvage.xyz/?scan=${result.chain}:${result.contractAddress}

Best,
[Your Name / ENS / Handle]

---
Salvage Protocol · Find it. Claim it. Recover it.
usesalvage.xyz`.trim()
}