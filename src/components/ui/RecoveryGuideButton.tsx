'use client'

import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { base } from 'wagmi/chains'
import {
  USDC_ADDRESS,
  USDC_ABI,
  GUIDE_PAYMENT_RECIPIENT,
  GUIDE_PRICE_RECOVERABLE,
  GUIDE_PRICE_NEEDS_ACTION,
} from '@/lib/contracts'

interface RecoveryGuideButtonProps {
  triageStatus:    string
  contractAddress: string
  isFounder:       boolean
  // Calldata to recover tokens — shown after unlock
  rescueFunctionName?: string
}

// Generate recovery calldata based on triage result
function generateGuideContent(
  contractAddress: string,
  triageStatus: string,
  rescueFunctionName?: string
): string {
  if (triageStatus === 'recoverable' && rescueFunctionName) {
    return `
SALVAGE RECOVERY GUIDE
══════════════════════════════════

CONTRACT: ${contractAddress}
STATUS: Recoverable — rescue function detected
FUNCTION: ${rescueFunctionName}()

STEP 1 — VERIFY THE FIND
Go to Etherscan/Basescan and confirm:
• The contract holds ERC-20 token balances
• The ${rescueFunctionName}() function exists in the ABI
• The owner() address is active (not 0x000...000)

STEP 2 — CONTACT THE TEAM
Use this outreach template (Copy Outreach button).
Send to: project Discord, Telegram, or official email.
Reference the specific token address and balance.

STEP 3 — EXECUTE RECOVERY
The contract owner calls:
  ${rescueFunctionName}(tokenAddress, amount, recipientAddress)

Most rescue functions follow this signature.
If the signature differs, check the verified ABI on Etherscan.

STEP 4 — CLAIM YOUR FEE
After recovery is confirmed, your 7% finder's fee
routes automatically via the Salvage fee contract.
No action needed — payment is trustless and on-chain.

TIMEFRAME: Owner must execute within 90 days of your registration.

══════════════════════════════════
Salvage Protocol · usesalvage.xyz
    `.trim()
  }

  return `
SALVAGE RECOVERY GUIDE
══════════════════════════════════

CONTRACT: ${contractAddress}
STATUS: Needs Action — upgrade required

STEP 1 — CONFIRM THE FIND
Verify on Etherscan that:
• Tokens are stranded (check token balances at contract address)
• No rescue function exists in current ABI
• Contract IS upgradeable (proxy pattern detected)

STEP 2 — CONTACT THE TEAM
Use the Copy Outreach button to generate your message.
Key points to include:
• Exact token amounts and USD value stranded
• Contract address and token addresses
• Reference to the upgrade path (proxy type detected)

STEP 3 — GOVERNANCE PATH
The team must:
1. Propose an upgrade to add a rescue function
2. Pass governance vote (if applicable)
3. Deploy upgraded implementation via ProxyAdmin
4. Call rescue function on upgraded contract

STEP 4 — CLAIM YOUR FEE
Once recovery is confirmed, your 7% routes automatically.

NOTE: This path requires team cooperation and governance.
Average timeline: 2-4 weeks after team engagement.

══════════════════════════════════
Salvage Protocol · usesalvage.xyz
  `.trim()
}

export default function RecoveryGuideButton({
  triageStatus,
  contractAddress,
  isFounder,
  rescueFunctionName,
}: RecoveryGuideButtonProps) {
  const { address, isConnected, chainId } = useAccount()
  const { writeContractAsync }            = useWriteContract()
  const { switchChainAsync }              = useSwitchChain()

  const [unlocked,  setUnlocked]  = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [txHash,    setTxHash]    = useState<`0x${string}` | null>(null)
  const [pending,   setPending]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  const price        = triageStatus === 'recoverable'
    ? GUIDE_PRICE_RECOVERABLE
    : GUIDE_PRICE_NEEDS_ACTION
  const priceLabel   = triageStatus === 'recoverable' ? '$149' : '$99'
  const usdcAddress  = USDC_ADDRESS[8453] // Always pay on Base — cheapest gas

  const { isLoading: confirming, isSuccess: unlockConfirmed } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
  })

  // Unlock after tx confirms
  if (unlockConfirmed && !unlocked) setUnlocked(true)

  // Founder always has access
  if (isFounder) {
    return (
      <div style={{ marginLeft: 'auto' }}>
        {showGuide ? (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
          }} onClick={() => setShowGuide(false)}>
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border-md)',
              borderRadius: '14px', padding: '28px', maxWidth: '560px',
              width: '100%', maxHeight: '80vh', overflow: 'auto',
            }} onClick={e => e.stopPropagation()}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: '18px',
              }}>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: '1rem',
                  fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.04em', color: 'var(--text)',
                }}>
                  Recovery Guide
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                  color: 'var(--eth)', background: 'var(--eth-soft)',
                  border: '1px solid var(--eth-border)',
                  padding: '3px 8px', borderRadius: '4px',
                }}>
                  👑 Founder Access
                </div>
              </div>
              <pre style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                color: 'var(--text)', lineHeight: 1.65,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {generateGuideContent(contractAddress, triageStatus, rescueFunctionName)}
              </pre>
              <button
                className="btn-reg"
                style={{ width: '100%', marginTop: '20px' }}
                onClick={() => {
                  navigator.clipboard.writeText(
                    generateGuideContent(contractAddress, triageStatus, rescueFunctionName)
                  )
                }}
              >
                Copy Guide
              </button>
            </div>
          </div>
        ) : null}
        <button
          className="btn-guide-founder"
          onClick={() => setShowGuide(true)}
        >
          View Recovery Guide (Founder)
        </button>
      </div>
    )
  }

  // Unlocked state — show guide
  if (unlocked || showGuide) {
    return (
      <div style={{ marginLeft: 'auto' }}>
        {showGuide && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
          }} onClick={() => setShowGuide(false)}>
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border-md)',
              borderRadius: '14px', padding: '28px', maxWidth: '560px',
              width: '100%', maxHeight: '80vh', overflow: 'auto',
            }} onClick={e => e.stopPropagation()}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: '18px',
              }}>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: '1rem',
                  fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.04em', color: 'var(--text)',
                }}>
                  Recovery Guide
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                  color: 'var(--green)', background: 'var(--green-soft)',
                  border: '1px solid var(--green-border)',
                  padding: '3px 8px', borderRadius: '4px',
                }}>
                  ✓ Unlocked
                </div>
              </div>
              <pre style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                color: 'var(--text)', lineHeight: 1.65,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {generateGuideContent(contractAddress, triageStatus, rescueFunctionName)}
              </pre>
              <button
                className="btn-reg"
                style={{ width: '100%', marginTop: '20px' }}
                onClick={() => {
                  navigator.clipboard.writeText(
                    generateGuideContent(contractAddress, triageStatus, rescueFunctionName)
                  )
                }}
              >
                Copy Guide
              </button>
            </div>
          </div>
        )}
        <button
          className="btn-guide"
          onClick={() => setShowGuide(true)}
        >
          View Recovery Guide ✓
        </button>
      </div>
    )
  }

  // Not connected
  if (!isConnected) {
    return (
      <button
        className="btn-guide"
        style={{ marginLeft: 'auto', opacity: 0.5, cursor: 'not-allowed' }}
        disabled
      >
        Unlock Recovery Guide — {priceLabel}
      </button>
    )
  }

  // Locked — pay with USDC on Base
  const handleUnlock = async () => {
    if (!address) return
    setPending(true)
    setError(null)

    try {
      // Switch to Base for payment (cheapest gas)
      if (chainId !== base.id) {
        await switchChainAsync({ chainId: base.id })
      }

      const hash = await writeContractAsync({
        address:      usdcAddress,
        abi:          USDC_ABI,
        functionName: 'transfer',
        args:         [GUIDE_PAYMENT_RECIPIENT, price],
        chainId:      base.id,
      })

      setTxHash(hash)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Payment failed'
      if (msg.includes('rejected') || msg.includes('denied')) {
        setError('Payment rejected.')
      } else if (msg.includes('insufficient') || msg.includes('balance')) {
        setError(`Insufficient USDC on Base. Need ${priceLabel}.`)
      } else {
        setError('Payment failed. Try again.')
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
      <button
        className="btn-guide"
        onClick={handleUnlock}
        disabled={pending || confirming}
      >
        {pending    ? 'Check wallet…'       :
         confirming ? 'Confirming payment…' :
         `Unlock Recovery Guide — ${priceLabel} USDC`}
      </button>
      {!pending && !confirming && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
          color: 'var(--text-3)',
        }}>
          Paid in USDC on Base · instant unlock
        </div>
      )}
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