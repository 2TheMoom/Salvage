import { Chain, TriageCheck, TriageStatus, ScanResult } from '@/types'

// ── Known rescue function signatures
// These are the most common patterns found in ERC-20 contracts
const RESCUE_SIGNATURES = [
  'rescueERC20',
  'recoverERC20',
  'withdrawToken',
  'rescueTokens',
  'recoverTokens',
  'emergencyWithdraw',
  'salvageTokens',
  'extractERC20',
  'drainERC20',
  'sweepToken',
  'rescueFunds',
  'recoverFunds',
  'withdrawERC20',
]

// ── Etherscan API V2 base — single key covers ETH + Base via chainid param
const ETHERSCAN_BASE = 'https://api.etherscan.io/v2/api'
const CHAIN_IDS: Record<Chain, number> = {
  eth:  1,
  base: 8453,
}

// ── Alchemy RPC endpoints (server-side only)
function getRpcUrl(chain: Chain): string {
  if (chain === 'eth')  return process.env.ALCHEMY_ETH_RPC!
  if (chain === 'base') return process.env.ALCHEMY_BASE_RPC!
  throw new Error(`Unknown chain: ${chain}`)
}

// ── Check if address is a contract via eth_getCode
export async function isContract(address: string, chain: Chain): Promise<boolean> {
  const rpc = getRpcUrl(chain)
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getCode',
      params: [address, 'latest'],
      id: 1,
    }),
  })
  const data = await res.json()
  // '0x' means EOA (wallet), anything longer is a contract
  return data.result && data.result !== '0x' && data.result.length > 2
}

// ── Fetch verified ABI from Etherscan API V2
export async function fetchAbi(
  address: string,
  chain: Chain
): Promise<{ abi: string | null; isVerified: boolean }> {
  const chainId = CHAIN_IDS[chain]
  const url = `${ETHERSCAN_BASE}?chainid=${chainId}&module=contract&action=getabi&address=${address}&apikey=${process.env.ETHERSCAN_API_KEY}`

  const res  = await fetch(url, { next: { revalidate: 3600 } })
  const data = await res.json()

  if (data.status === '1' && data.result) {
    return { abi: data.result, isVerified: true }
  }
  return { abi: null, isVerified: false }
}

// ── Fetch contract source info (name, deployer) from Etherscan API V2
export async function fetchContractInfo(
  address: string,
  chain: Chain
): Promise<{ tokenName?: string; tokenSymbol?: string; deployerAddress?: string }> {
  const chainId = CHAIN_IDS[chain]

  // Get contract source info for name
  const srcUrl = `${ETHERSCAN_BASE}?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${process.env.ETHERSCAN_API_KEY}`
  const srcRes  = await fetch(srcUrl, { next: { revalidate: 3600 } })
  const srcData = await srcRes.json()

  let tokenName: string | undefined
  let tokenSymbol: string | undefined
  if (srcData.status === '1' && srcData.result?.[0]) {
    const info = srcData.result[0]
    tokenName   = info.ContractName || undefined
  }

  // Get token info for symbol
  const tokUrl = `${ETHERSCAN_BASE}?chainid=${chainId}&module=token&action=tokeninfo&contractaddress=${address}&apikey=${process.env.ETHERSCAN_API_KEY}`
  const tokRes  = await fetch(tokUrl, { next: { revalidate: 3600 } })
  const tokData = await tokRes.json()

  if (tokData.status === '1' && tokData.result?.[0]) {
    const tok  = tokData.result[0]
    tokenName  = tok.tokenName   || tokenName
    tokenSymbol = tok.symbol     || undefined
  }

  // Get creator address from contract creation tx
  const creatorUrl = `${ETHERSCAN_BASE}?chainid=${chainId}&module=contract&action=getcontractcreation&contractaddresses=${address}&apikey=${process.env.ETHERSCAN_API_KEY}`
  const creatorRes  = await fetch(creatorUrl, { next: { revalidate: 3600 } })
  const creatorData = await creatorRes.json()

  let deployerAddress: string | undefined
  if (creatorData.status === '1' && creatorData.result?.[0]) {
    deployerAddress = creatorData.result[0].contractCreator
  }

  return { tokenName, tokenSymbol, deployerAddress }
}

// ── Check if ABI contains any known rescue function
export function detectRescueFunction(abiJson: string): {
  found: boolean
  functionName?: string
} {
  try {
    const abi = JSON.parse(abiJson)
    for (const item of abi) {
      if (item.type !== 'function') continue
      const name: string = item.name || ''
      const match = RESCUE_SIGNATURES.find(
        sig => name.toLowerCase() === sig.toLowerCase()
      )
      if (match) return { found: true, functionName: name }
    }
  } catch {
    // ABI parse failed — treat as unverified
  }
  return { found: false }
}

// ── Check if ABI contains owner() or access control
export function detectOwner(abiJson: string): boolean {
  try {
    const abi = JSON.parse(abiJson)
    return abi.some(
      (item: { type: string; name: string }) =>
        item.type === 'function' &&
        ['owner', 'getOwner', 'DEFAULT_ADMIN_ROLE', 'getRoleAdmin'].includes(item.name)
    )
  } catch {
    return false
  }
}

// ── Check if ABI suggests upgradeability (proxy pattern)
export function detectUpgradeability(abiJson: string): {
  isUpgradeable: boolean
  proxyType?: string
} {
  try {
    const abi = JSON.parse(abiJson)
    const names = abi
      .filter((i: { type: string }) => i.type === 'function')
      .map((i: { name: string }) => (i.name || '').toLowerCase())

    // UUPS pattern
    if (names.includes('upgradeto') || names.includes('upgradetoandeall')) {
      return { isUpgradeable: true, proxyType: 'UUPS' }
    }
    // Transparent proxy pattern
    if (names.includes('implementation') && names.includes('admin')) {
      return { isUpgradeable: true, proxyType: 'Transparent' }
    }
    // Beacon proxy
    if (names.includes('beacon')) {
      return { isUpgradeable: true, proxyType: 'Beacon' }
    }
  } catch {
    // ignore
  }
  return { isUpgradeable: false }
}

// ── Build triage checks and determine overall status
export function buildTriage(params: {
  isVerified:     boolean
  rescueFound:    boolean
  rescueName?:    string
  hasOwner:       boolean
  isUpgradeable:  boolean
  proxyType?:     string
}): { checks: TriageCheck[]; status: TriageStatus } {
  const checks: TriageCheck[] = []

  // Check 1: ABI verification
  checks.push({
    status: params.isVerified ? 'pass' : 'fail',
    label:  params.isVerified ? 'Contract verified on Etherscan' : 'Contract not verified',
    detail: params.isVerified
      ? 'ABI is publicly available — full triage possible'
      : 'Cannot read ABI — triage limited. Ask the team to verify.',
  })

  // Check 2: Rescue function
  checks.push({
    status: params.rescueFound ? 'pass' : 'fail',
    label:  params.rescueFound
      ? `${params.rescueName}() found in ABI`
      : 'No rescue function detected',
    detail: params.rescueFound
      ? 'Owner can call this directly — no upgrade needed to recover'
      : 'No known rescue function in ABI — recovery requires upgrade or governance',
  })

  // Check 3: Upgradeability
  if (!params.rescueFound) {
    checks.push({
      status: params.isUpgradeable ? 'warn' : 'fail',
      label:  params.isUpgradeable
        ? `${params.proxyType} proxy detected`
        : 'Contract is not upgradeable',
      detail: params.isUpgradeable
        ? `Upgrade path available — owner can add a rescue function via ${params.proxyType} upgrade`
        : 'Immutable contract — no path to add rescue function',
    })
  }

  // Check 4: Owner / access control
  checks.push({
    status: params.hasOwner ? 'pass' : 'fail',
    label:  params.hasOwner ? 'Access control present' : 'No owner or access control',
    detail: params.hasOwner
      ? 'owner() or role-based access detected — a responsible party exists'
      : 'No owner detected — may be fully decentralized or renounced',
  })

  // ── Determine overall triage status
  let status: TriageStatus

  if (params.rescueFound) {
    // Has rescue function — fully recoverable
    status = 'recoverable'
  } else if (params.isUpgradeable && params.hasOwner) {
    // No rescue fn but upgradeable with an owner — needs action
    status = 'needs_action'
  } else if (!params.isVerified && params.isUpgradeable) {
    // Unverified but proxy — give benefit of doubt
    status = 'needs_action'
  } else {
    // No rescue fn, not upgradeable, or no owner — dead
    status = 'unrecoverable'
  }

  return { checks, status }
}

// ── Master scan function — orchestrates all checks
export async function scanContract(
  address: string,
  chain: Chain
): Promise<ScanResult> {
  const normalizedAddress = address.toLowerCase()

  // Step 1: Confirm it's a contract
  const contractCheck = await isContract(normalizedAddress, chain)
  if (!contractCheck) {
    return {
      contractAddress: normalizedAddress,
      chain,
      isContract: false,
      isVerified: false,
      triageStatus: 'unrecoverable',
      checks: [{
        status: 'fail',
        label:  'Not a contract',
        detail: 'This address is a wallet (EOA), not a smart contract. Nothing is stranded here.',
      }],
    }
  }

  // Step 2: Fetch ABI
  const { abi, isVerified } = await fetchAbi(normalizedAddress, chain)

  // Step 3: Fetch contract metadata
  const { tokenName, tokenSymbol, deployerAddress } = await fetchContractInfo(
    normalizedAddress,
    chain
  )

  // Step 4: Run detection (if verified)
  let rescueFound  = false
  let rescueName: string | undefined
  let hasOwner     = false
  let isUpgradeable = false
  let proxyType: string | undefined

  if (abi) {
    const rescue = detectRescueFunction(abi)
    rescueFound  = rescue.found
    rescueName   = rescue.functionName

    hasOwner     = detectOwner(abi)

    const proxy  = detectUpgradeability(abi)
    isUpgradeable = proxy.isUpgradeable
    proxyType    = proxy.proxyType
  }

  // Step 5: Build triage
  const { checks, status } = buildTriage({
    isVerified,
    rescueFound,
    rescueName,
    hasOwner,
    isUpgradeable,
    proxyType,
  })

  return {
    contractAddress: normalizedAddress,
    chain,
    isContract:      true,
    isVerified,
    tokenName,
    tokenSymbol,
    deployerAddress,
    triageStatus:    status,
    checks,
  }
}