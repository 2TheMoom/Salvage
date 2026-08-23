'use client'

import { useMemo } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import { zeroHash, type Abi } from 'viem'
import { Chain, StrandedToken, RescueAbiEntry } from '@/types'
import OwnerClaimPanel from './OwnerClaimPanel'

const CHAIN_IDS: Record<Chain, 1 | 8453> = { eth: 1, base: 8453 }

interface AccessControlOwnerGateProps {
  contractAddress: string
  chain: Chain
  // Role-constant getter names detected in the ABI (DEFAULT_ADMIN_ROLE
  // always first) — see detectAccessControlRoles in lib/scanner.ts.
  roles: string[]
  tokens: StrandedToken[]
  rescueAbiEntry?: RescueAbiEntry
}

// AccessControl has no single owner() to resolve server-side — a contract
// can have many role holders, and which one can actually call the rescue
// function depends on which role gates it. This reads each detected role
// constant's real bytes32 value, then checks hasRole() for whichever wallet
// is actually connected. A match is treated as "the owner" for this claim
// and gets the exact same OwnerClaimPanel a plain Ownable contract would —
// no separate UI path, no separate trust model.
export default function AccessControlOwnerGate({
  contractAddress, chain, roles, tokens, rescueAbiEntry,
}: AccessControlOwnerGateProps) {
  const { address, isConnected } = useAccount()
  const chainId = CHAIN_IDS[chain]

  const customRoleNames = useMemo(
    () => roles.filter((r) => r !== 'DEFAULT_ADMIN_ROLE'),
    [roles]
  )

  // Step 1: read each custom role constant's real bytes32 value — never
  // guessed, DEFAULT_ADMIN_ROLE is the only one whose value is fixed by spec.
  const { data: roleValueResults } = useReadContracts({
    contracts: customRoleNames.map((name) => ({
      address: contractAddress as `0x${string}`,
      abi: [{ type: 'function', stateMutability: 'view', name, inputs: [], outputs: [{ type: 'bytes32' }] }] as unknown as Abi,
      functionName: name,
      chainId,
    })),
    query: { enabled: customRoleNames.length > 0 },
  })

  const roleValues = useMemo(() => {
    const values: `0x${string}`[] = roles.includes('DEFAULT_ADMIN_ROLE') ? [zeroHash] : []
    customRoleNames.forEach((_, i) => {
      const r = roleValueResults?.[i]
      if (r?.status === 'success' && typeof r.result === 'string') {
        values.push(r.result as `0x${string}`)
      }
    })
    return values
  }, [roles, customRoleNames, roleValueResults])

  // Step 2: hasRole(roleValue, connectedWallet) for every resolved role —
  // any single match is enough to treat this wallet as the owner.
  const HAS_ROLE_ABI = [{
    type: 'function', stateMutability: 'view', name: 'hasRole',
    inputs: [{ type: 'bytes32' }, { type: 'address' }], outputs: [{ type: 'bool' }],
  }] as const

  const { data: hasRoleResults } = useReadContracts({
    contracts: roleValues.map((value) => ({
      address: contractAddress as `0x${string}`,
      abi: HAS_ROLE_ABI,
      functionName: 'hasRole' as const,
      args: [value, address as `0x${string}`] as const,
      chainId,
    })),
    query: { enabled: isConnected && !!address && roleValues.length > 0 },
  })

  const isAccessControlOwner = !!hasRoleResults?.some(
    (r) => r.status === 'success' && r.result === true
  )

  if (!isAccessControlOwner || !address) return null

  return (
    <OwnerClaimPanel
      contractAddress={contractAddress}
      chain={chain}
      ownerAddress={address}
      tokens={tokens}
      rescueAbiEntry={rescueAbiEntry}
    />
  )
}
