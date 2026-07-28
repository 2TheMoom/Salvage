import { Chain } from '@/types'
import { getServerPublicClient } from './contracts'

// USDC exposes isBlacklisted(address), USDT exposes isBlackListed(address) —
// both public view functions, callable for free, no transaction needed.
// Almost every other token implements neither; those calls are expected to
// revert, which is treated as "not blacklisted" (nothing to detect) rather
// than an error, since there's no other blacklist mechanism to check against.
const BLACKLIST_CHECKS = [
  {
    name: 'isBlacklisted',
    abi: [{
      name: 'isBlacklisted', type: 'function', stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'bool' }],
    }],
  },
  {
    name: 'isBlackListed',
    abi: [{
      name: 'isBlackListed', type: 'function', stateMutability: 'view',
      inputs: [{ name: '_maker', type: 'address' }], outputs: [{ name: '', type: 'bool' }],
    }],
  },
] as const

// settle() pays victim, finder, and protocolFeeRecipient sequentially in one
// transaction with no partial-settlement path — if any single recipient is
// blacklisted by the token issuer for that specific token, the whole call
// reverts forever, and the swept funds have no other way out of the claim's
// receiver contract. This is a real risk reduction (catches the common case:
// already-blacklisted before settlement is ever attempted), not a guarantee
// (a blacklisting that happens after this check but before settle() lands
// isn't caught) — the router itself isn't upgradeable, so the actual fix
// requires a new contract deployment; this is the mitigation available
// without one.
export async function checkBlacklist(
  chain: Chain,
  token: `0x${string}`,
  addresses: `0x${string}`[]
): Promise<Record<string, boolean>> {
  const client = getServerPublicClient(chain)
  const result: Record<string, boolean> = {}

  await Promise.all(
    addresses.map(async (address) => {
      const lower = address.toLowerCase()
      for (const check of BLACKLIST_CHECKS) {
        try {
          const flagged = await client.readContract({
            address: token,
            abi: check.abi,
            functionName: check.name,
            args: [address],
          })
          if (flagged) {
            result[lower] = true
            return
          }
        } catch {
          // token doesn't implement this particular check — try the next one
        }
      }
      result[lower] = false
    })
  )

  return result
}
