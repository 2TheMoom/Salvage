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

// USDC addresses per chain
export const USDC_ADDRESS: Record<number, `0x${string}`> = {
  1:    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // ETH mainnet
  8453: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // Base mainnet
}

// Recovery guide prices in USDC (6 decimals)
export const GUIDE_PRICE_RECOVERABLE  = 149_000_000n // $149 USDC
export const GUIDE_PRICE_NEEDS_ACTION = 99_000_000n  // $99 USDC

// Guide payment recipient — founder wallet
export const GUIDE_PAYMENT_RECIPIENT = '0x8a485a86393d9e218c888a24d281f2df5bc37265' as const

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