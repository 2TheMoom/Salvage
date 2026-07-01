// ── Chain
export type Chain = 'eth' | 'base'

// ── Triage status
export type TriageStatus = 'recoverable' | 'needs_action' | 'unrecoverable'

// ── Individual triage check
export interface TriageCheck {
  status: 'pass' | 'fail' | 'warn'
  label: string
  detail: string
}

// ── Full scan result
export interface ScanResult {
  contractAddress: string
  chain: Chain
  isContract: boolean
  isVerified: boolean
  tokenName?: string
  tokenSymbol?: string
  deployerAddress?: string
  implementationAddress?: string
  triageStatus: TriageStatus
  checks: TriageCheck[]
  // M2: populated later
  strandedTokens?: StrandedToken[]
  totalStrandedUsd?: number
  finderFeeUsd?: number
}

// ── Stranded token (M2)
export interface StrandedToken {
  tokenAddress: string
  tokenName: string
  tokenSymbol: string
  balance: string
  balanceFormatted: string
  priceUsd: number
  valueUsd: number
}

// ── API response wrapper
export interface ScanApiResponse {
  success: boolean
  result?: ScanResult
  error?: string
}