import { getCreate2Address, keccak256, encodePacked, getAddress } from 'viem'
import { Chain } from '@/types'
import { getServerPublicClient } from './contracts'

// Do NOT add 'skim' to scanner.ts's RESCUE_SIGNATURES list. That list trusts
// whatever ABI Etherscan/Arcscan returns for the specific address being
// scanned — an attacker could deploy a contract with a function literally
// named `skim` and an arbitrary, malicious implementation, and the existing
// rescue-calldata builder would build calldata from THEIR declared shape.
// Name-matching alone is not verification.
//
// Instead: prove the candidate is byte-identical to a real, audited
// Uniswap V2 pair via CREATE2. If the canonical pairFor formula, run against
// a trusted factory's own address + init code hash, reproduces the
// candidate's own address, that's cryptographic proof of identical
// bytecode — not a guess, not a duck-typed name match.
//
// Verified empirically (not just documented) before this shipped: predicted
// both the real WETH/USDC pair on Ethereum AND on Base using the SAME init
// code hash against each chain's own factory, and both matched the pair
// address each factory's own getPair() actually returns.
interface TrustedFactory {
  factory: `0x${string}`
  initCodeHash: `0x${string}`
  chain: Chain
  dexName: string
}

const UNISWAP_V2_INIT_CODE_HASH: `0x${string}` =
  '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f'

const TRUSTED_V2_FACTORIES: TrustedFactory[] = [
  {
    factory: getAddress('0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'),
    initCodeHash: UNISWAP_V2_INIT_CODE_HASH,
    chain: 'eth',
    dexName: 'Uniswap V2',
  },
  {
    factory: getAddress('0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6'),
    initCodeHash: UNISWAP_V2_INIT_CODE_HASH,
    chain: 'base',
    dexName: 'Uniswap V2',
  },
]

const PAIR_PROBE_ABI = [
  { name: 'token0', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'token1', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    name: 'getReserves', type: 'function', stateMutability: 'view', inputs: [],
    outputs: [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }],
  },
] as const

const ERC20_BALANCE_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

function pairFor(factory: `0x${string}`, tokenA: `0x${string}`, tokenB: `0x${string}`, initCodeHash: `0x${string}`): `0x${string}` {
  const [token0, token1] = BigInt(tokenA) < BigInt(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
  const salt = keccak256(encodePacked(['address', 'address'], [token0, token1]))
  return getCreate2Address({ from: factory, salt, bytecodeHash: initCodeHash })
}

export interface PoolProbeResult {
  token0: `0x${string}`
  token1: `0x${string}`
  dexName: string
}

// Any revert at any step (not a pool, or a pool with a shape this doesn't
// recognize) is treated as "not a verified pool" — fail closed, matching
// blacklist.ts's BLACKLIST_CHECKS pattern.
export async function probeUniswapV2Pool(address: string, chain: Chain): Promise<PoolProbeResult | null> {
  const factories = TRUSTED_V2_FACTORIES.filter((f) => f.chain === chain)
  if (factories.length === 0) return null

  const client = getServerPublicClient(chain)
  const target = getAddress(address)

  let token0: `0x${string}`, token1: `0x${string}`
  try {
    ;[token0, token1] = await Promise.all([
      client.readContract({ address: target, abi: PAIR_PROBE_ABI, functionName: 'token0' }),
      client.readContract({ address: target, abi: PAIR_PROBE_ABI, functionName: 'token1' }),
    ])
    if (!token0 || !token1 || token0 === token1) return null
  } catch {
    return null
  }

  for (const factory of factories) {
    const predicted = pairFor(factory.factory, token0, token1, factory.initCodeHash)
    if (predicted.toLowerCase() !== target.toLowerCase()) continue

    // Cryptographic match confirmed. getReserves() is just a liveness
    // check from here — not part of the trust decision.
    try {
      await client.readContract({ address: target, abi: PAIR_PROBE_ABI, functionName: 'getReserves' })
    } catch {
      return null
    }
    return { token0, token1, dexName: factory.dexName }
  }

  return null
}

export async function getReserves(pool: string, chain: Chain): Promise<{ reserve0: bigint; reserve1: bigint }> {
  const client = getServerPublicClient(chain)
  const [reserve0, reserve1] = await client.readContract({
    address: getAddress(pool), abi: PAIR_PROBE_ABI, functionName: 'getReserves',
  })
  return { reserve0: reserve0 as bigint, reserve1: reserve1 as bigint }
}

// skim(address to) sweeps the excess of BOTH tokens, not just the one a
// claim is registered for. This lets the UI disclose that honestly before
// the button is ever clickable, rather than let a one-click action imply a
// cleaner recovery than it actually is.
export async function getPoolExcessBalance(
  pool: string, token: `0x${string}`, reserve: bigint, chain: Chain
): Promise<bigint> {
  const client = getServerPublicClient(chain)
  const balance = await client.readContract({
    address: token, abi: ERC20_BALANCE_ABI, functionName: 'balanceOf', args: [getAddress(pool)],
  })
  return balance > reserve ? balance - reserve : 0n
}
