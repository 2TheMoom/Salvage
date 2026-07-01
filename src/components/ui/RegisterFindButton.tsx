'use client'

import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { mainnet, base } from 'wagmi/chains'
import { FEE_CONTRACT_ADDRESS, FEE_CONTRACT_ABI } from '@/lib/contracts'
import { Chain } from '@/types'

interface RegisterFindButtonProps {
  contractAddress: string
  tokenAddress:    string
  chain:           Chain
  triageStatus:    string
}

export default function RegisterFindButton({
  contractAddress,
  tokenAddress,
  chain,
  triageStatus,
}: RegisterFindButtonProps) {
  const { address, isConnected, chainId } = useAccount()
  const { writeContractAsync }            = useWriteContract()
  const { switchChainAsync }              = useSwitchChain()

  const [txHash,  setTxHash]  = useState<`0x${string}` | null>(null)
  const [pending, setPending] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [done,    setDone]    = useState(false)

  const targetChainId = chain === 'eth' ? mainnet.id : base.id
  const explorerBase  = chain === 'eth' ? 'https://etherscan.io' : 'https://basescan.org'

  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
    // confirmed via isSuccess below
  })

  // Watch for confirmation
  if (confirmed && !done) setDone(true)

  if (!isConnected) {
    return (
      <button className="btn-reg" style={{ opacity: 0.5, cursor: 'not-allowed' }} disabled>
        Connect Wallet to Register
      </button>
    )
  }

  if (triageStatus === 'unrecoverable') return null

  if (done && txHash) {
    return (
      <a
        href={`${explorerBase}/tx/${txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
          color: 'var(--green)', textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}
      >
        ✓ Find registered on-chain · View tx ↗
      </a>
    )
  }

  const handleRegister = async () => {
    if (!address) return
    setPending(true)
    setError(null)

    try {
      // Switch chain if needed
      if (chainId !== targetChainId) {
        await switchChainAsync({ chainId: targetChainId })
      }

      // Use first stranded token as the tokenAddress if none provided
      const token = tokenAddress || '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'

      const hash = await writeContractAsync({
        address:      FEE_CONTRACT_ADDRESS,
        abi:          FEE_CONTRACT_ABI,
        functionName: 'registerFind',
        args:         [contractAddress as `0x${string}`, token as `0x${string}`],
        chainId:      targetChainId,
      })

      setTxHash(hash)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      if (msg.includes('rejected') || msg.includes('denied')) {
        setError('Transaction rejected.')
      } else if (msg.includes('already')) {
        setError('Find already registered for this contract.')
      } else {
        setError('Registration failed. Try again.')
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <button
        className="btn-reg"
        onClick={handleRegister}
        disabled={pending || confirming}
      >
        {pending     ? 'Check wallet…'    :
         confirming  ? 'Confirming…'      :
         'Register This Find'}
      </button>
      {error && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.67rem',
          color: 'var(--crimson)',
        }}>
          ✗ {error}
        </div>
      )}
    </div>
  )
}