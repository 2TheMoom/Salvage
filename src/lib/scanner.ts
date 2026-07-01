import { Chain, TriageCheck, TriageStatus, ScanResult } from '@/types'

const RESCUE_SIGNATURES = [
  'rescueERC20', 'recoverERC20', 'withdrawToken', 'rescueTokens',
  'recoverTokens', 'emergencyWithdraw', 'salvageTokens', 'extractERC20',
  'drainERC20', 'sweepToken', 'rescueFunds', 'recoverFunds', 'withdrawERC20',
]

const ETHERSCAN_BASE = 'https://api.etherscan.io/v2/api'
const CHAIN_IDS: Record<Chain, number> = { eth: 1, base: 8453 }

// ── Proxy implementation storage slots
// EIP-1967:  keccak256("eip1967.proxy.implementation") - 1
const SLOT_EIP1967_IMPL   = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
// EIP-1967:  keccak256("eip1967.proxy.beacon") - 1
const SLOT_EIP1967_BEACON = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50'
// Legacy ZeppelinOS: keccak256("org.zeppelinos.proxy.implementation")
// (used by USDC's FiatTokenProxy and other pre-EIP-1967 proxies)
const SLOT_ZOS_IMPL       = '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3'

// ── ERC-20 selectors
const SEL_NAME   = '0x06fdde03' // name()
const SEL_SYMBOL = '0x95d89b41' // symbol()

function getRpcUrl(chain: Chain): string {
  if (chain === 'eth')  return process.env.ALCHEMY_ETH_RPC!
  if (chain === 'base') return process.env.ALCHEMY_BASE_RPC!
  throw new Error(`Unknown chain: ${chain}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms))
}

// ═══════════════════════════════════════════════════════════
//  RPC helpers — Alchemy, never rate-limited by Etherscan
// ═══════════════════════════════════════════════════════════

async function rpc(rpcUrl: string, method: string, params: unknown[]): Promise<string | null> {
  try {
    const res = await fetch(rpcUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    })
    const data = await res.json()
    return typeof data.result === 'string' ? data.result : null
  } catch {
    return null
  }
}

export async function isContract(address: string, chain: Chain): Promise<boolean> {
  const code = await rpc(getRpcUrl(chain), 'eth_getCode', [address, 'latest'])
  return !!code && code !== '0x' && code.length > 2
}

// Decode a string returned from eth_call — handles both the standard
// ABI-encoded dynamic string AND raw bytes32 (e.g. MKR's symbol).
function decodeStringResult(hex: string | null): string | undefined {
  if (!hex || hex === '0x' || hex.length <= 2) return undefined
  const raw = hex.slice(2)
  try {
    let bytes: string
    if (raw.length === 64) {
      // bytes32 — trim trailing zeros
      bytes = raw.replace(/(00)+$/, '')
    } else if (raw.length >= 128) {
      // dynamic string: [offset][length][data...]
      const len = parseInt(raw.slice(64, 128), 16)
      if (!Number.isFinite(len) || len === 0 || len > 256) return undefined
      bytes = raw.slice(128, 128 + len * 2)
    } else {
      return undefined
    }
    let out = ''
    for (let i = 0; i < bytes.length; i += 2) {
      const code = parseInt(bytes.slice(i, i + 2), 16)
      if (code === 0) continue
      out += String.fromCharCode(code)
    }
    const clean = out.trim()
    // Only accept printable ASCII-ish results
    return clean && /^[\x20-\x7E]+$/.test(clean) ? clean : undefined
  } catch {
    return undefined
  }
}

// Read name() and symbol() directly from the chain.
// This is the source of truth — no Etherscan, no rate limits.
async function fetchOnchainIdentity(
  address: string, chain: Chain
): Promise<{ name?: string; symbol?: string }> {
  const rpcUrl = getRpcUrl(chain)
  const [nameHex, symbolHex] = await Promise.all([
    rpc(rpcUrl, 'eth_call', [{ to: address, data: SEL_NAME },   'latest']),
    rpc(rpcUrl, 'eth_call', [{ to: address, data: SEL_SYMBOL }, 'latest']),
  ])
  return {
    name:   decodeStringResult(nameHex),
    symbol: decodeStringResult(symbolHex),
  }
}

// Detect proxy implementation via storage slots — deterministic, RPC-based.
async function fetchProxyImplementation(
  address: string, chain: Chain
): Promise<{ implementation?: string; proxyType?: string }> {
  const rpcUrl = getRpcUrl(chain)

  const slotToAddress = (slotValue: string | null): string | undefined => {
    if (!slotValue || slotValue === '0x') return undefined
    const hex = slotValue.slice(2).padStart(64, '0')
    const addr = '0x' + hex.slice(24)
    return /^0x[0-9a-fA-F]{40}$/.test(addr) && addr !== '0x0000000000000000000000000000000000000000'
      ? addr.toLowerCase()
      : undefined
  }

  const [eip1967, zos, beacon] = await Promise.all([
    rpc(rpcUrl, 'eth_getStorageAt', [address, SLOT_EIP1967_IMPL,   'latest']),
    rpc(rpcUrl, 'eth_getStorageAt', [address, SLOT_ZOS_IMPL,       'latest']),
    rpc(rpcUrl, 'eth_getStorageAt', [address, SLOT_EIP1967_BEACON, 'latest']),
  ])

  const eip1967Impl = slotToAddress(eip1967)
  if (eip1967Impl) return { implementation: eip1967Impl, proxyType: 'EIP-1967' }

  const zosImpl = slotToAddress(zos)
  if (zosImpl) return { implementation: zosImpl, proxyType: 'Legacy Zeppelin' }

  const beaconAddr = slotToAddress(beacon)
  if (beaconAddr) return { implementation: undefined, proxyType: 'Beacon' }

  return {}
}

// ═══════════════════════════════════════════════════════════
//  Etherscan helpers — serialized, with retry on rate limit
// ═══════════════════════════════════════════════════════════

// Etherscan free tier throttles bursts. Every call goes through this:
// retries with backoff when the response says "rate limit", and each
// call is spaced out by the caller. NEVER call Pro-only endpoints
// (e.g. token/tokeninfo) — they always fail on free keys.
async function etherscanFetch(
  chain: Chain, params: string, attempts = 4
): Promise<Record<string, unknown> | null> {
  const chainId = CHAIN_IDS[chain]
  const url = `${ETHERSCAN_BASE}?chainid=${chainId}&${params}&apikey=${process.env.ETHERSCAN_API_KEY}`

  for (let i = 0; i < attempts; i++) {
    try {
      const res  = await fetch(url)
      const data = await res.json() as Record<string, unknown>
      const resultStr = typeof data.result === 'string' ? data.result : ''
      const isRateLimited =
        /rate limit/i.test(resultStr) || /rate limit/i.test(String(data.message || ''))

      if (!isRateLimited) return data
    } catch { /* network hiccup — retry */ }

    await sleep(400 * (i + 1)) // 400ms, 800ms, 1200ms backoff
  }
  return null
}

export async function fetchAbi(
  address: string, chain: Chain
): Promise<{ abi: string | null; isVerified: boolean }> {
  const data = await etherscanFetch(chain, `module=contract&action=getabi&address=${address}`)
  if (data && data.status === '1' && typeof data.result === 'string') {
    return { abi: data.result, isVerified: true }
  }
  return { abi: null, isVerified: false }
}

async function fetchSourceName(address: string, chain: Chain): Promise<string | undefined> {
  const data = await etherscanFetch(chain, `module=contract&action=getsourcecode&address=${address}`)
  const first = (data?.result as Array<Record<string, string>> | undefined)?.[0]
  const name  = first?.ContractName || first?.contractName
  return name && name.trim() ? name.trim() : undefined
}

async function fetchDeployer(address: string, chain: Chain): Promise<string | undefined> {
  const data = await etherscanFetch(
    chain, `module=contract&action=getcontractcreation&contractaddresses=${address}`
  )
  const first = (data?.result as Array<Record<string, string>> | undefined)?.[0]
  return first?.contractCreator || undefined
}

// ═══════════════════════════════════════════════════════════
//  ABI analysis
// ═══════════════════════════════════════════════════════════

export function detectRescueFunction(abiJson: string): {
  found: boolean; functionName?: string
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
  } catch { /* ignore */ }
  return { found: false }
}

export function detectOwner(abiJson: string): boolean {
  try {
    const abi = JSON.parse(abiJson)
    return abi.some(
      (item: { type: string; name: string }) =>
        item.type === 'function' &&
        ['owner', 'getOwner', 'DEFAULT_ADMIN_ROLE', 'getRoleAdmin'].includes(item.name)
    )
  } catch { return false }
}

export function detectUpgradeability(abiJson: string): {
  isUpgradeable: boolean; proxyType?: string
} {
  try {
    const abi   = JSON.parse(abiJson)
    const names = abi
      .filter((i: { type: string }) => i.type === 'function')
      .map((i: { name: string }) => (i.name || '').toLowerCase())

    if (names.includes('upgradeto') || names.includes('upgradetoandcall')) {
      return { isUpgradeable: true, proxyType: 'UUPS' }
    }
    if (names.includes('implementation') && names.includes('admin')) {
      return { isUpgradeable: true, proxyType: 'Transparent' }
    }
    if (names.includes('beacon')) {
      return { isUpgradeable: true, proxyType: 'Beacon' }
    }
  } catch { /* ignore */ }
  return { isUpgradeable: false }
}

// Merge two ABI JSON arrays (proxy + implementation) for detection.
function mergeAbis(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  try {
    return JSON.stringify([...JSON.parse(a), ...JSON.parse(b)])
  } catch {
    return a || b
  }
}

function truncAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

// ═══════════════════════════════════════════════════════════
//  Triage
// ═══════════════════════════════════════════════════════════

export function buildTriage(params: {
  isVerified:      boolean
  rescueFound:     boolean
  rescueName?:     string
  hasOwner:        boolean
  isUpgradeable:   boolean
  proxyType?:      string
  implementation?: string
}): { checks: TriageCheck[]; status: TriageStatus } {
  const checks: TriageCheck[] = []

  checks.push({
    status: params.isVerified ? 'pass' : 'fail',
    label:  params.isVerified ? 'Contract verified on Etherscan' : 'Contract not verified',
    detail: params.isVerified
      ? (params.implementation
          ? `ABI resolved via implementation at ${truncAddr(params.implementation)}`
          : 'ABI is publicly available — full triage possible')
      : 'Cannot read ABI — triage limited. Ask the team to verify.',
  })

  checks.push({
    status: params.rescueFound ? 'pass' : 'fail',
    label:  params.rescueFound
      ? `${params.rescueName}() found in ABI`
      : 'No rescue function detected',
    detail: params.rescueFound
      ? 'Owner can call this directly — no upgrade needed to recover'
      : 'No known rescue function in ABI — recovery requires upgrade or governance',
  })

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

  checks.push({
    status: params.hasOwner ? 'pass' : 'fail',
    label:  params.hasOwner ? 'Access control present' : 'No owner or access control',
    detail: params.hasOwner
      ? 'owner() or role-based access detected — a responsible party exists'
      : 'No owner detected — may be fully decentralized or renounced',
  })

  let status: TriageStatus
  if (params.rescueFound) {
    status = 'recoverable'
  } else if (params.isUpgradeable && params.hasOwner) {
    status = 'needs_action'
  } else if (!params.isVerified && params.isUpgradeable) {
    status = 'needs_action'
  } else {
    status = 'unrecoverable'
  }

  return { checks, status }
}

// ═══════════════════════════════════════════════════════════
//  Main scan
// ═══════════════════════════════════════════════════════════

export async function scanContract(address: string, chain: Chain): Promise<ScanResult> {
  const normalizedAddress = address.toLowerCase()

  const contractCheck = await isContract(normalizedAddress, chain)
  if (!contractCheck) {
    return {
      contractAddress: normalizedAddress,
      chain,
      isContract:  false,
      isVerified:  false,
      triageStatus: 'unrecoverable',
      checks: [{
        status: 'fail',
        label:  'Not a contract',
        detail: 'This address is a wallet (EOA), not a smart contract. Nothing is stranded here.',
      }],
    }
  }

  // ── Step 1: On-chain identity + proxy detection (RPC — parallel, no rate limits)
  const [identity, proxyInfo] = await Promise.all([
    fetchOnchainIdentity(normalizedAddress, chain),
    fetchProxyImplementation(normalizedAddress, chain),
  ])

  // ── Step 2: Etherscan calls — strictly SERIALIZED with spacing to
  //    stay inside the free-tier rate limit. Never fire these in parallel.
  const { abi: proxyAbi, isVerified } = await fetchAbi(normalizedAddress, chain)
  await sleep(250)

  let implAbi: string | null = null
  if (proxyInfo.implementation) {
    const implResult = await fetchAbi(proxyInfo.implementation, chain)
    implAbi = implResult.abi
    await sleep(250)
  }

  // Source name is only a FALLBACK for non-token contracts —
  // on-chain name()/symbol() is always preferred.
  let sourceName: string | undefined
  if (!identity.name) {
    sourceName = await fetchSourceName(normalizedAddress, chain)
    await sleep(250)
  }

  const deployerAddress = await fetchDeployer(normalizedAddress, chain)

  // ── Step 3: Analyze the MERGED ABI (proxy + implementation)
  const mergedAbi = mergeAbis(proxyAbi, implAbi)

  let rescueFound   = false
  let rescueName:   string | undefined
  let hasOwner      = false
  let isUpgradeable = !!proxyInfo.implementation || proxyInfo.proxyType === 'Beacon'
  let proxyType     = proxyInfo.proxyType

  if (mergedAbi) {
    const rescue = detectRescueFunction(mergedAbi)
    rescueFound  = rescue.found
    rescueName   = rescue.functionName
    hasOwner     = detectOwner(mergedAbi)

    if (!isUpgradeable) {
      const proxy   = detectUpgradeability(mergedAbi)
      isUpgradeable = proxy.isUpgradeable
      proxyType     = proxy.proxyType
    }
  }

  const { checks, status } = buildTriage({
    isVerified:      isVerified || !!implAbi,
    rescueFound, rescueName, hasOwner, isUpgradeable, proxyType,
    implementation:  implAbi ? proxyInfo.implementation : undefined,
  })

  return {
    contractAddress:       normalizedAddress,
    chain,
    isContract:            true,
    isVerified:            isVerified || !!implAbi,
    tokenName:             identity.name || sourceName,
    tokenSymbol:           identity.symbol,
    deployerAddress,
    implementationAddress: proxyInfo.implementation,
    triageStatus:          status,
    checks,
  }
}