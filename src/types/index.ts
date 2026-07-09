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
  ownerAddress?: string
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
// ── Victim scan (tokens mistakenly sent to contract addresses)

export interface VictimFinding {
  txHash: string
  timestamp?: string
  tokenAddress: string
  tokenSymbol: string
  tokenName: string
  amount: string
  valueUsd: number
  recipientContract: string
  recipientName?: string
  sentToSelf: boolean          // classic: token sent to its own contract
  contractStillHolds: string   // recipient's current balance of that token
  triageStatus?: TriageStatus
  rescueFunction?: string
}

export interface VictimScanResult {
  wallet: string
  chain: Chain
  findings: VictimFinding[]
  totalLostUsd: number
}

export interface VictimScanApiResponse {
  success: boolean
  result?: VictimScanResult
  error?: string
}