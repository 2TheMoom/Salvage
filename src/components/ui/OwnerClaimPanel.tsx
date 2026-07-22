'use client'

import { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react'
import {
  useAccount, useSignTypedData, useWriteContract, useReadContract, useSwitchChain,
} from 'wagmi'
import { waitForTransactionReceipt, estimateGas } from 'wagmi/actions'
import { keccak256, encodeAbiParameters, encodeFunctionData, zeroAddress, type Abi } from 'viem'
import { config } from '@/lib/wagmi'
import {
  RECOVERY_ROUTER_ADDRESS, ROUTER_ABI, ROUTER_EIP712_TYPES,
  BATCH_WRAPPER_ADDRESS, BATCH_WRAPPER_ABI, BATCH_MAX_SIZE,
  routerDomain, USDC_ABI, contractScanLossTxHash,
} from '@/lib/contracts'
import { Chain, StrandedToken, RescueAbiEntry } from '@/types'
import ShareReceiptButton from './ShareReceiptButton'

// Maps a rescue function's real ABI inputs to known values by name + type
// heuristics — never a guess about what the contract *does*, only about
// which declared parameter is likely the token/recipient/amount slot.
// Anything not confidently matched is left blank for the owner to fill in
// and verify themselves, rather than silently guessed.
function mapRescueArgs(
  inputs: { name: string; type: string }[],
  tokenAddress: string,
  receiverAddress: string,
  amountRaw: string
): string[] {
  const addressInputs = inputs.filter((i) => i.type === 'address')
  const uintInputs     = inputs.filter((i) => /^u?int/.test(i.type))

  return inputs.map((input) => {
    const n = input.name.toLowerCase()
    if (input.type === 'address') {
      if (/token/.test(n)) return tokenAddress
      if (/to|recipient|receiver|dest|beneficiary/.test(n)) return receiverAddress
      // A lone, unnamed address param on a rescue-style function is
      // overwhelmingly "which token to rescue" in practice.
      if (addressInputs.length === 1) return tokenAddress
      return ''
    }
    if (/^u?int/.test(input.type)) {
      if (/amount|amt|value|qty|quantity/.test(n) || uintInputs.length === 1) {
        return amountRaw
      }
      return ''
    }
    return ''
  })
}

const CHAIN_IDS: Record<Chain, 1 | 8453> = { eth: 1, base: 8453 }

type RowState = 'idle' | 'signing' | 'registering' | 'registered' | 'settling' | 'settled' | 'error'

interface RowHandle {
  register: () => Promise<void>
  settle: () => Promise<void>
  // Used by the wrapper batch flow: after a batch transaction confirms, each
  // affected row re-reads its own on-chain state (so a token that actually
  // failed inside the wrapper's try/catch correctly stays unregistered/
  // unsettled — reality, not batch intent, drives what each row shows) and
  // records the shared batch tx hash for its own explorer link.
  refetch: () => void
  setTxHash: (kind: 'register' | 'settle', hash: string) => void
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Batch wrapper calls (batchRegisterClaims/batchSettle) have highly variable
// per-item cost — each item is either a cheap no-op (skipped via the
// wrapper's internal try/catch) or a full CREATE2 deploy + balance check +
// up to 3 token transfers. A wallet's default estimate/buffer is sized for
// typical variance, not "every item happens to hit the expensive path" —
// under-provisioning starves whichever item runs last in the batch. Padding
// the estimate here (rather than trusting the wallet's default) directly
// targets that failure mode. Falls back to no override (wallet default) if
// estimation itself fails, so this can only make gas sizing better, never
// worse, than what already happens today.
const BATCH_GAS_BUFFER_BPS = 13_000n // +30%

async function estimateBatchGas(params: {
  address: `0x${string}`
  abi: Abi
  functionName: string
  args: readonly unknown[]
  chainId: 1 | 8453
}): Promise<bigint | undefined> {
  try {
    const data = encodeFunctionData({ abi: params.abi, functionName: params.functionName, args: params.args })
    const estimate = await estimateGas(config, { to: params.address, data, chainId: params.chainId })
    return (estimate * BATCH_GAS_BUFFER_BPS) / 10_000n
  } catch {
    return undefined
  }
}

interface OwnerClaimPanelProps {
  contractAddress: string
  chain: Chain
  ownerAddress: string
  tokens: StrandedToken[]
  rescueAbiEntry?: RescueAbiEntry
}

// Shown only to the wallet matching the contract's on-chain owner() — the
// only address that can actually execute a rescue call on this contract,
// so it's the only one a claim here can ever be fulfilled for. Registering
// as anyone else produces a claim that can never be funded; the router
// doesn't need to enforce that on-chain (same "front-running is harmless"
// logic as everywhere else in this contract), so the gate lives here.
export default function OwnerClaimPanel({ contractAddress, chain, ownerAddress, tokens, rescueAbiEntry }: OwnerClaimPanelProps) {
  const { address, isConnected } = useAccount()
  const isOwner = isConnected && address?.toLowerCase() === ownerAddress.toLowerCase()

  const chainId        = CHAIN_IDS[chain]
  const routerAddress  = RECOVERY_ROUTER_ADDRESS[chainId]
  const wrapperAddress = BATCH_WRAPPER_ADDRESS[chainId]

  const { switchChainAsync }   = useSwitchChain()
  const { signTypedDataAsync } = useSignTypedData()
  const { writeContractAsync } = useWriteContract()

  const [registeredFinder, setRegisteredFinder] = useState<string | null>(null)

  useEffect(() => {
    if (!isOwner) return
    const findKey = `${chain}:contract:${contractAddress.toLowerCase()}`
    fetch(`/api/finds?findKey=${encodeURIComponent(findKey)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.find) {
          const finder = d.find.finder_address as string | undefined
          if (finder && finder.toLowerCase() !== ownerAddress.toLowerCase()) {
            setRegisteredFinder(finder)
          }
        }
      })
      .catch(() => {})
  }, [chain, contractAddress, ownerAddress, isOwner])

  const finderForClaim = (registeredFinder ?? zeroAddress) as `0x${string}`
  const lossTxHash = useMemo(() => contractScanLossTxHash(contractAddress), [contractAddress])

  const computeClaimId = (tokenAddress: string): `0x${string}` =>
    keccak256(encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'bytes32' }],
      [tokenAddress as `0x${string}`, ownerAddress as `0x${string}`, finderForClaim, lossTxHash]
    ))

  // Per-token live status, reported up by each row — drives the "Register
  // All" / "Settle All" batch actions and which tokens they cover. A single
  // stranded token never needs this (the per-row buttons already cover it),
  // so the batch controls only appear once there's actually more than one
  // token to walk through.
  const [rowStatus, setRowStatus] = useState<Record<string, { state: RowState; funded: boolean }>>({})
  const rowRefs = useRef<Map<string, RowHandle>>(new Map())
  const [batchRunning, setBatchRunning]   = useState<'register' | 'settle' | null>(null)
  const [batchProgress, setBatchProgress] = useState(0)
  const [batchChunkInfo, setBatchChunkInfo] = useState<{ current: number; total: number } | null>(null)

  const handleStatusChange = (tokenAddress: string, state: RowState, funded: boolean) => {
    setRowStatus((prev) => ({ ...prev, [tokenAddress]: { state, funded } }))
  }

  if (!isOwner || tokens.length === 0) return null

  const hasFinder = !!registeredFinder

  const pendingRegistration = tokens.filter((t) => {
    const s = rowStatus[t.tokenAddress]?.state
    return !s || s === 'idle' || s === 'error'
  })
  const readyToSettle = tokens.filter((t) => {
    const s = rowStatus[t.tokenAddress]
    return s?.state === 'registered' && s.funded
  })
  const allSettled = tokens.length > 1
    && tokens.every((t) => rowStatus[t.tokenAddress]?.state === 'settled')

  // Batches of up to BATCH_MAX_SIZE tokens, each as one SalvageBatchWrapper
  // transaction. Registering still needs one EIP-712 signature per token
  // (the router verifies each independently — that can't be skipped without
  // the router itself changing), but those are fast, free, off-chain
  // signatures, not separate transactions. Settling needs no signature at
  // all, so it's a full one-click-per-chunk win. A chunk's transaction
  // failing (e.g. rejected in the wallet) leaves that chunk's rows exactly
  // as they were — nothing landed on-chain, so nothing to undo.
  const runBatchRegister = async (queue: StrandedToken[]) => {
    setBatchRunning('register')
    setBatchProgress(0)
    const groups = chunk(queue, BATCH_MAX_SIZE)
    await switchChainAsync({ chainId }).catch(() => {})
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)

    for (let g = 0; g < groups.length; g++) {
      const group = groups[g]
      setBatchChunkInfo({ current: g + 1, total: groups.length })

      const signatures: `0x${string}`[] = []
      for (const token of group) {
        try {
          const sig = await signTypedDataAsync({
            domain: routerDomain(chainId),
            types: ROUTER_EIP712_TYPES,
            primaryType: 'RecoveryClaim',
            message: {
              token:  token.tokenAddress as `0x${string}`,
              victim: ownerAddress as `0x${string}`,
              finder: finderForClaim,
              lossTxHash,
              deadline,
            },
          })
          signatures.push(sig)
        } catch {
          // A rejected/failed signature can't be submitted — pass an empty
          // one through so the wrapper's per-token try/catch skips just
          // this token instead of blocking the rest of the group.
          signatures.push('0x')
        }
        setBatchProgress((n) => n + 1)
      }

      try {
        const registerArgs = {
          address: wrapperAddress,
          abi: BATCH_WRAPPER_ABI,
          functionName: 'batchRegisterClaims' as const,
          args: [
            group.map((t) => t.tokenAddress as `0x${string}`),
            ownerAddress as `0x${string}`,
            finderForClaim,
            lossTxHash,
            deadline,
            signatures,
          ] as const,
          chainId,
        }
        const gas = await estimateBatchGas(registerArgs)
        const txHash = await writeContractAsync({ ...registerArgs, ...(gas ? { gas } : {}) })
        await waitForTransactionReceipt(config, { hash: txHash, chainId })

        for (const token of group) {
          const claimId = computeClaimId(token.tokenAddress)
          // The API verifies each claim directly on-chain before recording
          // it — a token that actually failed inside the wrapper simply
          // won't be found yet, and this call harmlessly 404s for it.
          fetch('/api/claims', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              claimId, chain,
              tokenSymbol: token.tokenSymbol,
              valueUsd:    token.valueUsd,
              registerTx:  txHash,
              recipientContract: contractAddress,
            }),
          }).catch(() => {})
          const handle = rowRefs.current.get(token.tokenAddress)
          handle?.setTxHash('register', txHash)
          handle?.refetch()
        }
      } catch {
        // This chunk's transaction itself failed/was rejected — nothing in
        // it landed on-chain, so its rows are simply unchanged.
      }
    }
    setBatchRunning(null)
    setBatchChunkInfo(null)
  }

  const runBatchSettle = async (queue: StrandedToken[]) => {
    setBatchRunning('settle')
    setBatchProgress(0)
    const groups = chunk(queue, BATCH_MAX_SIZE)
    await switchChainAsync({ chainId }).catch(() => {})

    for (let g = 0; g < groups.length; g++) {
      const group = groups[g]
      setBatchChunkInfo({ current: g + 1, total: groups.length })
      const claimIds = group.map((t) => computeClaimId(t.tokenAddress))

      try {
        const settleArgs = {
          address: wrapperAddress,
          abi: BATCH_WRAPPER_ABI,
          functionName: 'batchSettle' as const,
          args: [claimIds] as const,
          chainId,
        }
        const gas = await estimateBatchGas(settleArgs)
        const txHash = await writeContractAsync({ ...settleArgs, ...(gas ? { gas } : {}) })
        await waitForTransactionReceipt(config, { hash: txHash, chainId })

        for (const token of group) {
          const claimId = computeClaimId(token.tokenAddress)
          // Same on-chain verification as the single-token flow — a claim
          // that wasn't actually funded yet correctly 400s here rather than
          // being marked settled.
          fetch('/api/claims', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ claimId, settleTx: txHash }),
          }).catch(() => {})
          const handle = rowRefs.current.get(token.tokenAddress)
          handle?.setTxHash('settle', txHash)
          handle?.refetch()
        }
      } catch {
        // Chunk's transaction failed/was rejected — its rows are unchanged.
      }
      setBatchProgress((n) => n + group.length)
    }
    setBatchRunning(null)
    setBatchChunkInfo(null)
  }

  return (
    <div style={{
      marginTop: '12px', padding: '14px',
      borderRadius: '8px', background: 'var(--card)',
      border: '1px solid var(--eth-border)',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--eth)', marginBottom: '4px',
      }}>
        Contract Owner — Recover Stranded Tokens
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.64rem',
        color: 'var(--text-2)', lineHeight: 1.7, marginBottom: '10px',
      }}>
        {hasFinder
          ? 'A finder registered this contract first. Recovery routes 90% to you, 7% to them, 3% to the protocol.'
          : 'No finder has registered this contract. Recovery routes 95% to you, 5% to the protocol.'}
      </div>

      {allSettled && (
        <div style={{
          marginBottom: '8px', padding: '8px 10px', borderRadius: '6px',
          background: 'var(--green-soft)', border: '1px solid var(--green)',
          color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: '0.66rem', fontWeight: 600,
        }}>
          ✓ All {tokens.length} tokens recovered — nothing left to settle here.
        </div>
      )}

      {(pendingRegistration.length > 1 || readyToSettle.length > 1) && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {pendingRegistration.length > 1 && (
              <button
                onClick={() => runBatchRegister(pendingRegistration)}
                disabled={!!batchRunning}
                style={{
                  padding: '7px 12px', borderRadius: '6px', border: 'none',
                  background: 'var(--eth)', color: '#fff', cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: '0.64rem', fontWeight: 600,
                  opacity: batchRunning ? 0.6 : 1,
                }}
              >
                {batchRunning === 'register'
                  ? `Registering ${batchProgress}/${pendingRegistration.length}…`
                  : `Register All (${pendingRegistration.length})`}
              </button>
            )}
            {readyToSettle.length > 1 && (
              <button
                onClick={() => runBatchSettle(readyToSettle)}
                disabled={!!batchRunning}
                style={{
                  padding: '7px 12px', borderRadius: '6px', border: 'none',
                  background: 'var(--green)', color: '#fff', cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: '0.64rem', fontWeight: 600,
                  opacity: batchRunning ? 0.6 : 1,
                }}
              >
                {batchRunning === 'settle'
                  ? `Settling ${batchProgress}/${readyToSettle.length}…`
                  : `Settle All (${readyToSettle.length})`}
              </button>
            )}
          </div>
          {batchRunning && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-3)', marginTop: '5px' }}>
              {batchRunning === 'register'
                ? "You'll be prompted to sign once per token (quick, free), then confirm one transaction per batch of 20."
                : "One transaction confirmation per batch of 20 — no signatures needed to settle."}
              {batchChunkInfo && batchChunkInfo.total > 1 && ` Batch ${batchChunkInfo.current}/${batchChunkInfo.total}.`}
            </div>
          )}
        </div>
      )}

      {tokens.map((token) => (
        <OwnerClaimRow
          key={token.tokenAddress}
          ref={(el) => {
            if (el) rowRefs.current.set(token.tokenAddress, el)
            else rowRefs.current.delete(token.tokenAddress)
          }}
          contractAddress={contractAddress}
          chain={chain}
          ownerAddress={ownerAddress}
          finderAddress={registeredFinder}
          token={token}
          rescueAbiEntry={rescueAbiEntry}
          onStatusChange={handleStatusChange}
        />
      ))}
    </div>
  )
}

interface OwnerClaimRowProps {
  contractAddress: string
  chain: Chain
  ownerAddress: string
  finderAddress: string | null
  token: StrandedToken
  rescueAbiEntry?: RescueAbiEntry
  onStatusChange?: (tokenAddress: string, state: RowState, funded: boolean) => void
}

const OwnerClaimRow = forwardRef<RowHandle, OwnerClaimRowProps>(function OwnerClaimRow(
  { contractAddress, chain, ownerAddress, finderAddress, token, rescueAbiEntry, onStatusChange },
  ref
) {
  const chainId = CHAIN_IDS[chain]
  const routerAddress = RECOVERY_ROUTER_ADDRESS[chainId]

  const { switchChainAsync }   = useSwitchChain()
  const { signTypedDataAsync } = useSignTypedData()
  const { writeContractAsync } = useWriteContract()

  const [state, setState]           = useState<RowState>('idle')
  const [errorMsg, setErrorMsg]     = useState<string | null>(null)
  const [registerTx, setRegisterTx] = useState<string | null>(null)
  const [settleTx, setSettleTx]     = useState<string | null>(null)
  const [copied, setCopied]         = useState(false)

  const finderForClaim = (finderAddress ?? zeroAddress) as `0x${string}`
  const hasFinder = finderForClaim !== zeroAddress
  const lossTxHash = useMemo(() => contractScanLossTxHash(contractAddress), [contractAddress])

  const claimId = useMemo(() => {
    try {
      return keccak256(encodeAbiParameters(
        [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'bytes32' }],
        [
          token.tokenAddress as `0x${string}`,
          ownerAddress as `0x${string}`,
          finderForClaim,
          lossTxHash,
        ]
      ))
    } catch { return undefined }
  }, [token.tokenAddress, ownerAddress, finderForClaim, lossTxHash])

  const [everRegistered, setEverRegistered] = useState(false)
  const { data: existingClaim, refetch: refetchClaim } = useReadContract({
    address: routerAddress,
    abi: ROUTER_ABI,
    functionName: 'claims',
    args: claimId ? [claimId] : undefined,
    chainId,
    // settle() is permissionless — a finder or anyone else could call it
    // directly without going through Salvage's UI at all, so this needs the
    // same "poll while it could change externally" treatment as funding.
    query: { enabled: !!claimId, refetchInterval: everRegistered ? 8000 : false },
  })
  const alreadyRegistered = existingClaim && existingClaim[1] !== zeroAddress
  const alreadySettledOnChain = !!existingClaim && (existingClaim[5] as bigint) > 0n
  const isSettled = alreadySettledOnChain || state === 'settled'
  const isRegistered = alreadyRegistered || state === 'registered' || state === 'settled'

  useEffect(() => {
    if (isRegistered && !isSettled) setEverRegistered(true)
    if (isSettled) setEverRegistered(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRegistered, isSettled])

  const { data: receiver } = useReadContract({
    address: routerAddress,
    abi: ROUTER_ABI,
    functionName: 'claimReceiver',
    args: claimId ? [claimId] : undefined,
    chainId,
    query: { enabled: !!claimId },
  })

  // Funding happens by the owner calling their own contract's rescue
  // function — entirely outside Salvage's UI, so there's no "we just did
  // this, refetch now" moment to hook into like there is for register/
  // settle. Polling while registered-but-not-yet-funded is the only way
  // "Funded — ready to settle" can appear without a manual page refresh.
  const awaitingFunding = isRegistered && !isSettled
  const { data: receiverBalance, refetch: refetchBalance } = useReadContract({
    address: token.tokenAddress as `0x${string}`,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: receiver ? [receiver] : undefined,
    chainId,
    query: {
      enabled: !!receiver && (!!alreadyRegistered || state === 'registered' || state === 'settled'),
      refetchInterval: awaitingFunding ? 8000 : false,
    },
  })
  const funded = (receiverBalance ?? 0n) > 0n

  // Report the *derived* status up, not the raw local `state` — a token
  // already registered/settled on a previous visit still starts this
  // component at local state 'idle' until the on-chain reads above resolve,
  // and the batch controls need the real picture, not the fresh-mount one.
  const derivedState: RowState = isSettled ? 'settled' : isRegistered ? 'registered' : state
  useEffect(() => {
    onStatusChange?.(token.tokenAddress, derivedState, funded)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedState, funded])

  // Live balance of the stranded contract itself — this is the amount an
  // owner would actually rescue, distinct from `receiverBalance` above
  // (the claim's deposit address, which starts empty until the owner acts).
  const { data: contractTokenBalance } = useReadContract({
    address: token.tokenAddress as `0x${string}`,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [contractAddress as `0x${string}`],
    chainId,
    query: { enabled: !!rescueAbiEntry && isRegistered && !isSettled },
  })

  // Editable per-argument values for the decoded rescue call — prefilled
  // where the token/recipient/amount slot can be confidently identified,
  // left blank otherwise so the owner fills in and verifies the rest.
  const [argValues, setArgValues] = useState<string[]>([])

  useEffect(() => {
    if (!rescueAbiEntry || !receiver) return
    const amountRaw = (contractTokenBalance ?? BigInt(token.balance)).toString()
    setArgValues(
      mapRescueArgs(rescueAbiEntry.inputs, token.tokenAddress, receiver as string, amountRaw)
    )
  }, [rescueAbiEntry, receiver, contractTokenBalance, token.tokenAddress, token.balance])

  const rescueCalldata = useMemo(() => {
    if (!rescueAbiEntry) return null
    try {
      const args = rescueAbiEntry.inputs.map((input, i) => {
        const raw = argValues[i] ?? ''
        if (input.type === 'address') return raw as `0x${string}`
        if (/^u?int/.test(input.type)) return BigInt(raw)
        return raw
      })
      return encodeFunctionData({
        abi: [rescueAbiEntry] as unknown as Abi,
        functionName: rescueAbiEntry.name,
        args,
      })
    } catch {
      return null
    }
  }, [rescueAbiEntry, argValues])

  const [calldataCopied, setCalldataCopied] = useState(false)
  const copyCalldata = async () => {
    if (!rescueCalldata) return
    try {
      await navigator.clipboard.writeText(rescueCalldata)
      setCalldataCopied(true)
      setTimeout(() => setCalldataCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  const handleRegister = async () => {
    if (!claimId) return
    setErrorMsg(null)
    try {
      await switchChainAsync({ chainId }).catch(() => {})
      setState('signing')
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)
      const signature = await signTypedDataAsync({
        domain: routerDomain(chainId),
        types: ROUTER_EIP712_TYPES,
        primaryType: 'RecoveryClaim',
        message: {
          token:      token.tokenAddress as `0x${string}`,
          victim:     ownerAddress as `0x${string}`,
          finder:     finderForClaim,
          lossTxHash,
          deadline,
        },
      })

      setState('registering')
      const txHash = await writeContractAsync({
        address: routerAddress,
        abi: ROUTER_ABI,
        functionName: 'registerClaim',
        args: [
          token.tokenAddress as `0x${string}`,
          ownerAddress as `0x${string}`,
          finderForClaim,
          lossTxHash,
          deadline,
          signature,
        ],
        chainId,
      })

      // The API now verifies the claim directly on-chain before recording it
      // (see /api/claims), so it won't find anything until this tx actually
      // confirms — wait for the receipt first instead of firing right after
      // the wallet merely broadcasts it.
      waitForTransactionReceipt(config, { hash: txHash, chainId })
        .then(() => fetch('/api/claims', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            claimId, chain,
            tokenSymbol: token.tokenSymbol,
            valueUsd:    token.valueUsd,
            registerTx:  txHash,
            recipientContract: contractAddress,
          }),
        }))
        .catch(() => {})

      setRegisterTx(txHash)
      setState('registered')
      refetchClaim()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      setErrorMsg(msg.includes('rejected') || msg.includes('denied')
        ? 'Signature or transaction rejected.'
        : 'Claim registration failed. Please try again.')
      setState('error')
    }
  }

  const handleSettle = async () => {
    if (!claimId) return
    setErrorMsg(null)
    try {
      await switchChainAsync({ chainId }).catch(() => {})
      setState('settling')
      const settleHash = await writeContractAsync({
        address: routerAddress,
        abi: ROUTER_ABI,
        functionName: 'settle',
        args: [claimId],
        chainId,
      })
      setSettleTx(settleHash)
      waitForTransactionReceipt(config, { hash: settleHash, chainId })
        .then(() => fetch('/api/claims', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ claimId, settleTx: settleHash }),
        }))
        .catch(() => {})
      setState('settled')
      refetchBalance()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      setErrorMsg(msg.includes('rejected') || msg.includes('denied')
        ? 'Transaction rejected.'
        : msg.includes('nothing to settle')
          ? 'Nothing to settle yet — the receiver has no tokens.'
          : 'Settlement failed. Please try again.')
      setState('error')
    }
  }

  useImperativeHandle(ref, () => ({
    register: handleRegister,
    settle: handleSettle,
    refetch: () => { refetchClaim(); refetchBalance() },
    setTxHash: (kind, hash) => { kind === 'register' ? setRegisterTx(hash) : setSettleTx(hash) },
  }))

  const copyReceiverInstructions = async () => {
    if (!receiver) return
    const chainName = chain === 'eth' ? 'Ethereum' : 'Base'
    const explorer  = chain === 'eth' ? 'etherscan.io' : 'basescan.org'
    const text = `Recovery deposit address (Salvage claim ${claimId?.slice(0, 10)}…):

${receiver}

Call your contract's rescue function to send the stranded ${token.tokenSymbol} to this exact address on ${chainName}. Settlement is automatic and fully on-chain — ${hasFinder ? '90% to you, 7% to the finder, 3% to the protocol' : '95% to you, 5% to the protocol'}.

Verify the settlement contract yourself: https://${explorer}/address/${routerAddress}#code`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  const btnStyle = {
    padding: '6px 11px', borderRadius: '6px',
    border: '1px solid var(--border)', cursor: 'pointer',
    fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
  } as const

  return (
    <div style={{
      padding: '10px', marginTop: '8px', borderRadius: '6px',
      background: 'var(--card-inner)', border: '1px solid var(--border)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600,
        color: 'var(--text)', marginBottom: '6px',
      }}>
        <span>{token.tokenSymbol}</span>
        <span>${token.valueUsd.toFixed(2)}</span>
      </div>

      {isSettled ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: 'var(--green)' }}>
          <div>✓ Settled on-chain.</div>
          <div style={{ marginTop: '6px' }}>
            <ShareReceiptButton
              type="settle" perspective="victim"
              chain={chain} token={token.tokenAddress}
              lossTxHash={lossTxHash} recipientContract={contractAddress}
              amountUsd={token.valueUsd * (hasFinder ? 0.90 : 0.95)}
            />
          </div>
        </div>
      ) : isRegistered ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: 'var(--text-2)', lineHeight: 1.7 }}>
          <div style={{
            padding: '6px 8px', margin: '4px 0', borderRadius: '4px',
            background: 'var(--card)', border: '1px solid var(--border)',
            color: 'var(--text)', wordBreak: 'break-all',
          }}>
            {receiver}
          </div>
          <div style={{ marginBottom: '6px' }}>
            {funded
              ? <span style={{ color: 'var(--green)' }}>● Funded — ready to settle</span>
              : `Call your rescue function to send ${token.tokenSymbol} here.`}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button onClick={copyReceiverInstructions} style={{ ...btnStyle, background: 'var(--card)', color: 'var(--text)' }}>
              {copied ? '✓ Copied' : 'Copy Instructions'}
            </button>
            {funded && (
              <button onClick={handleSettle} disabled={state === 'settling'}
                style={{ ...btnStyle, background: 'var(--green)', color: '#fff', border: 'none', opacity: state === 'settling' ? 0.6 : 1 }}>
                {state === 'settling' ? 'Settling…' : 'Settle'}
              </button>
            )}
          </div>

          {!funded && rescueAbiEntry && (
            <div style={{
              marginTop: '8px', padding: '8px', borderRadius: '5px',
              background: 'var(--card)', border: '1px dashed var(--border)',
            }}>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                Rescue call helper — {rescueAbiEntry.name}()
              </div>
              <div style={{ fontSize: '0.6rem', opacity: 0.75, marginBottom: '6px' }}>
                Read from your contract&apos;s own ABI. Salvage can identify the
                function but not confirm what each parameter does — verify
                every value before using it.
              </div>
              {rescueAbiEntry.inputs.map((input, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.58rem', color: 'var(--text-3)', minWidth: '86px' }}>
                    {input.name || `arg${i}`} <em style={{ fontStyle: 'normal', opacity: 0.6 }}>({input.type})</em>
                  </span>
                  <input
                    value={argValues[i] ?? ''}
                    onChange={(e) => {
                      const next = [...argValues]
                      next[i] = e.target.value
                      setArgValues(next)
                    }}
                    placeholder="fill in and verify"
                    style={{
                      flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
                      padding: '3px 6px', borderRadius: '4px',
                      border: '1px solid var(--border)', background: 'var(--card-inner)',
                      color: 'var(--text)', minWidth: 0,
                    }}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                <button onClick={copyCalldata} disabled={!rescueCalldata}
                  style={{ ...btnStyle, background: 'var(--card-inner)', color: 'var(--text)', opacity: rescueCalldata ? 1 : 0.5 }}>
                  {calldataCopied ? '✓ Copied' : 'Copy Raw Calldata'}
                </button>
              </div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-3)', marginTop: '5px' }}>
                Send to contract: <span style={{ wordBreak: 'break-all' }}>{contractAddress}</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <button onClick={handleRegister} disabled={state === 'signing' || state === 'registering'}
          style={{
            ...btnStyle, background: 'var(--eth)', color: '#fff', border: 'none',
            opacity: (state === 'signing' || state === 'registering') ? 0.6 : 1,
          }}>
          {state === 'signing'      ? 'Sign in your wallet…'
          : state === 'registering' ? 'Registering…'
          : 'Register & Recover'}
        </button>
      )}

      {(registerTx || settleTx) && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
          {registerTx && (
            <a className="chip-link" href={`${chain === 'eth' ? 'https://etherscan.io' : 'https://basescan.org'}/tx/${registerTx}`}
               target="_blank" rel="noopener noreferrer">
              Registration tx ↗
            </a>
          )}
          {settleTx && (
            <a className="chip-link settled" href={`${chain === 'eth' ? 'https://etherscan.io' : 'https://basescan.org'}/tx/${settleTx}`}
               target="_blank" rel="noopener noreferrer">
              Settlement tx ↗
            </a>
          )}
        </div>
      )}

      {errorMsg && (
        <div style={{ marginTop: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--crimson)' }}>
          {errorMsg}
        </div>
      )}
    </div>
  )
})
