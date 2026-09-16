'use client'

import { useState, useEffect } from 'react'
import { useSendTransaction, useSwitchChain } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { encodeFunctionData, type Abi } from 'viem'
import { config } from '@/lib/wagmi'
import { VictimFinding, Chain } from '@/types'

const CHAIN_IDS: Record<Chain, 1 | 8453 | 5042> = { eth: 1, base: 8453, arc: 5042 }

interface PermissionlessRescueButtonProps {
  finding: VictimFinding
  receiver: string   // the claim's deposit address — skim()'s `to` argument
  chain: Chain
  onSent: () => void // let the parent refetch the receiver's balance
}

interface OtherTokenExcess {
  symbol: string
  excessFormatted: string
}

// Fires the pool's skim(address to) directly — no owner, no role, nobody to
// email. Any connected wallet can call this; the wallet's own confirmation
// screen is still the only safety checkpoint, same as OwnerClaimPanel's
// Send button. Distinguishes a rejected send from a broadcast-but-reverted
// one via the receipt status, for the same reason: a call into a contract
// Salvage doesn't audit can fail either way.
export default function PermissionlessRescueButton({ finding, receiver, chain, onSent }: PermissionlessRescueButtonProps) {
  const rescue = finding.permissionlessRescue
  const chainId = CHAIN_IDS[chain]
  const { sendTransactionAsync } = useSendTransaction()
  const { switchChainAsync } = useSwitchChain()

  const [otherToken, setOtherToken] = useState<OtherTokenExcess | null>(null)
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [sendTx, setSendTx] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!rescue) return
    const params = new URLSearchParams({
      chain, pool: finding.recipientContract,
      token0: rescue.token0, token1: rescue.token1, claimedToken: finding.tokenAddress,
    })
    fetch(`/api/pool-excess?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setOtherToken(d.otherToken) })
      .catch(() => {})
  }, [rescue, chain, finding.recipientContract, finding.tokenAddress])

  if (!rescue) return null

  const handleSend = async () => {
    setErrorMsg(null)
    try {
      await switchChainAsync({ chainId }).catch(() => {})
      setSendState('sending')
      const calldata = encodeFunctionData({
        abi: [rescue.abiEntry] as unknown as Abi,
        functionName: rescue.functionName,
        args: [receiver],
      })
      const txHash = await sendTransactionAsync({
        to: finding.recipientContract as `0x${string}`,
        data: calldata,
        chainId,
      })
      setSendTx(txHash)
      const receipt = await waitForTransactionReceipt(config, { hash: txHash, chainId })
      if (receipt.status === 'reverted') {
        setErrorMsg('The transaction reverted on-chain — unexpected for a verified pool. Verify the pool independently before retrying.')
        setSendState('error')
        return
      }
      setSendState('sent')
      onSent()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      setErrorMsg(msg.includes('rejected') || msg.includes('denied') ? 'Transaction rejected.' : 'Send failed. Try again.')
      setSendState('error')
    }
  }

  const btnStyle = {
    padding: '7px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font-mono)', fontSize: '0.64rem', fontWeight: 600,
  } as const

  return (
    <div style={{
      marginTop: '8px', padding: '8px 10px', borderRadius: '5px',
      background: 'var(--green-soft)', border: '1px solid var(--green-border)',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: 'var(--green)', lineHeight: 1.7, marginBottom: '6px' }}>
        This is a {rescue.dexName} pool — {rescue.functionName}() is permissionless, callable by anyone. No owner cooperation needed.
      </div>
      {otherToken && parseFloat(otherToken.excessFormatted) > 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--amber)', lineHeight: 1.7, marginBottom: '6px' }}>
          Heads up: calling {rescue.functionName}() also sweeps ~{otherToken.excessFormatted} {otherToken.symbol} here —
          that isn&apos;t part of this claim and would need its own separate claim to recover.
        </div>
      )}
      <button
        onClick={handleSend}
        disabled={sendState === 'sending'}
        style={{ ...btnStyle, background: 'var(--green)', color: '#fff', opacity: sendState === 'sending' ? 0.6 : 1 }}
      >
        {sendState === 'sending' ? 'Sending…' : sendState === 'sent' ? '✓ Sent — Send Again' : `Recover via ${rescue.functionName}()`}
      </button>
      {sendTx && (
        <div style={{ marginTop: '6px' }}>
          <a className="chip-link" href={`${chain === 'eth' ? 'https://etherscan.io' : chain === 'base' ? 'https://basescan.org' : 'https://explorer.arc.io'}/tx/${sendTx}`}
             target="_blank" rel="noopener noreferrer">
            Rescue tx ↗
          </a>
        </div>
      )}
      {errorMsg && (
        <div style={{ marginTop: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--crimson)' }}>
          {errorMsg}
        </div>
      )}
    </div>
  )
}
