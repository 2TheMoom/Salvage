// ── Chain
export type Chain = 'eth' | 'base' | 'arc'

// ── Triage status
export type TriageStatus = 'recoverable' | 'needs_action' | 'unrecoverable'

// ── Individual triage check
export interface TriageCheck {
  status: 'pass' | 'fail' | 'warn'
  label: string
  detail: string
}

// ── The matched rescue function's real ABI entry — read directly from the
// contract's verified ABI, not guessed. Enough shape to build a decoded
// calldata preview with viem's encodeFunctionData.
export interface RescueAbiEntry {
  name: string
  type: 'function'
  stateMutability: string
  inputs: { name: string; type: string }[]
}

// ── A rescue path that needs no owner or role at all — e.g. Uniswap V2's
// skim(address), callable by literally anyone. Populated only after
// cryptographic verification (CREATE2 address match against a trusted,
// audited factory) — never from name-matching an arbitrary contract's own
// declared ABI. abiEntry is always the hardcoded, known-safe shape.
export interface PermissionlessRescue {
  functionName: 'skim'
  abiEntry: RescueAbiEntry
  dexName: string
  // skim() sweeps BOTH pool tokens, not just the one a claim is for —
  // needed so the UI can honestly disclose the other token's excess before
  // the button is ever clickable.
  token0: string
  token1: string
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
  // Set only when the ABI exposes hasRole(bytes32,address) but no owner() —
  // role-constant getter names to check live against the connected wallet,
  // since AccessControl has no single canonical owner to resolve server-side.
  accessControlRoles?: string[]
  rescueAbiEntry?: RescueAbiEntry
  permissionlessRescue?: PermissionlessRescue
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

// Every verified candidate is, by construction, drawn from the seed set
// victim.ts builds (SYMBOL_MAP + the wallet's own transfer history + the DEX
// registry) — there's no "unknown" case given how candidates are seeded.
export type RecipientKind = 'self' | 'other_token' | 'known_pool' | 'known_router'

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
  recipientKind: RecipientKind   // replaces the old sentToSelf boolean
  dexName?: string               // populated for known_pool/known_router
  permissionlessRescue?: PermissionlessRescue
  contractStillHolds: string     // recipient's current balance of that token
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