import { keccak256, encodePacked } from 'viem'

// Contract addresses — same on both chains
export const FEE_CONTRACT_ADDRESS = '0xd21c72FBE27B6Cd26A5DBf49148B7bA0a4CAed27' as const

export const FEE_CONTRACT_ABI = [
  {
    name: 'registerFind',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'contractAddress', type: 'address' },
      { name: 'tokenAddress',    type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'confirmRecovery',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'contractAddress',  type: 'address' },
      { name: 'tokenAddress',     type: 'address' },
      { name: 'recoveredAmount',  type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'isClaimable',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'contractAddress', type: 'address' },
      { name: 'tokenAddress',    type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'getFind',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'contractAddress', type: 'address' },
      { name: 'tokenAddress',    type: 'address' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'hunter',          type: 'address' },
          { name: 'contractAddress', type: 'address' },
          { name: 'tokenAddress',    type: 'address' },
          { name: 'registeredAt',    type: 'uint256' },
          { name: 'confirmed',       type: 'bool'    },
          { name: 'expired',         type: 'bool'    },
        ],
      },
    ],
  },
  {
    name: 'getHunterEarnings',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'hunter', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'HUNTER_FEE_BPS',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'CLAIM_WINDOW',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'FindRegistered',
    type: 'event',
    inputs: [
      { name: 'findId',          type: 'bytes32', indexed: true  },
      { name: 'hunter',          type: 'address', indexed: true  },
      { name: 'contractAddress', type: 'address', indexed: true  },
      { name: 'tokenAddress',    type: 'address', indexed: false },
      { name: 'timestamp',       type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'RecoveryConfirmed',
    type: 'event',
    inputs: [
      { name: 'findId',          type: 'bytes32', indexed: true  },
      { name: 'hunter',          type: 'address', indexed: true  },
      { name: 'recoveredAmount', type: 'uint256', indexed: false },
      { name: 'hunterFee',       type: 'uint256', indexed: false },
      { name: 'protocolFee',     type: 'uint256', indexed: false },
    ],
  },
] as const

// USDC ERC-20 transfer ABI — minimal
export const USDC_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to',     type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const
// ═══════════════════════════════════════════════════════════
//  SalvageRecoveryRouter — non-custodial recovery settlement
// ═══════════════════════════════════════════════════════════

export const RECOVERY_ROUTER_ADDRESS: Record<number, `0x${string}`> = {
  1:    '0xD9A5f1Fcf39F99152d6443132B21C1D8f7fAAC25', // ETH mainnet
  8453: '0x2240792d1A9D964d238bD693fCb09586B10faEdf', // Base mainnet
}

export const ROUTER_ABI = [
  {
    name: 'registerClaim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token',           type: 'address' },
      { name: 'victim',          type: 'address' },
      { name: 'finder',          type: 'address' },
      { name: 'lossTxHash',      type: 'bytes32' },
      { name: 'deadline',        type: 'uint256' },
      { name: 'victimSignature', type: 'bytes'   },
    ],
    outputs: [
      { name: 'claimId',  type: 'bytes32' },
      { name: 'receiver', type: 'address' },
    ],
  },
  {
    name: 'claimReceiver',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'claimId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'settle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs:  [{ name: 'claimId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'claims',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: '', type: 'bytes32' }],
    outputs: [
      { name: 'token',        type: 'address' },
      { name: 'victim',       type: 'address' },
      { name: 'finder',       type: 'address' },
      { name: 'lossTxHash',   type: 'bytes32' },
      { name: 'createdAt',    type: 'uint64'  },
      { name: 'totalSettled', type: 'uint256' },
    ],
  },
  {
    name: 'ClaimRegistered',
    type: 'event',
    inputs: [
      { name: 'claimId',    type: 'bytes32', indexed: true  },
      { name: 'token',      type: 'address', indexed: true  },
      { name: 'victim',     type: 'address', indexed: true  },
      { name: 'finder',     type: 'address', indexed: false },
      { name: 'lossTxHash', type: 'bytes32', indexed: false },
      { name: 'receiver',   type: 'address', indexed: false },
    ],
  },
  {
    name: 'ClaimSettled',
    type: 'event',
    inputs: [
      { name: 'claimId',        type: 'bytes32', indexed: true  },
      { name: 'amount',         type: 'uint256', indexed: false },
      { name: 'victimPayout',   type: 'uint256', indexed: false },
      { name: 'finderPayout',   type: 'uint256', indexed: false },
      { name: 'protocolPayout', type: 'uint256', indexed: false },
    ],
  },
] as const

// EIP-712 typed-data shape for RecoveryClaim signatures
export const ROUTER_EIP712_TYPES = {
  RecoveryClaim: [
    { name: 'token',      type: 'address' },
    { name: 'victim',     type: 'address' },
    { name: 'finder',     type: 'address' },
    { name: 'lossTxHash', type: 'bytes32' },
    { name: 'deadline',   type: 'uint256' },
  ],
} as const

export function routerDomain(chainId: number) {
  return {
    name: 'SalvageRecoveryRouter',
    version: '1',
    chainId,
    verifyingContract: RECOVERY_ROUTER_ADDRESS[chainId],
  } as const
}

// Contract-scan claims aren't tied to one victim's single mistaken transfer
// the way "Did I lose tokens?" claims are — a stranded contract can hold
// many different senders' accidental transfers at once. There's no single
// lossTxHash for that, so we derive a stable, deterministic stand-in per
// contract instead. Safe to reuse across every token that contract holds:
// claimId already varies by `token` as a separate field, so this alone
// never causes two distinct claims to collide.
export function contractScanLossTxHash(contractAddress: string): `0x${string}` {
  return keccak256(encodePacked(
    ['string', 'address'],
    ['salvage-contract-scan', contractAddress as `0x${string}`]
  ))
}