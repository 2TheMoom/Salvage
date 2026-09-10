import { network } from 'hardhat'
import { getAddress, encodeFunctionData, type Address } from 'viem'

// Live end-to-end test of the exact mechanism the app's owner panel uses —
// register a claim, fire rescue calldata as a raw transaction (the same
// thing the "Send" button does), then settle — run against real Arc
// Testnet rather than local Hardhat, since Arc's own docs warn that local
// EVM simulators can't reproduce its real behavior (native-USDC gas,
// blocklist enforcement, min base fee, etc.).

const ROUTER   = getAddress('0xd21c72FBE27B6Cd26A5DBf49148B7bA0a4CAed27')
const TOKEN    = getAddress('0x2240792d1A9D964d238bD693fCb09586B10faEdf')
const VAULT    = getAddress('0xff2605c1cFC8fF3b2c8Dfde91E72E98595676995')
const PROTOCOL = getAddress('0x8a485a86393D9e218c888a24d281F2Df5Bc37265') // protocolFeeRecipient == victim here too, same as the Base live test
const LOSS_TX  = ('0x' + 'ab'.repeat(32)) as `0x${string}`

async function main() {
  const { viem, networkName } = await network.connect()
  const publicClient = await viem.getPublicClient()
  const [wallet] = await viem.getWalletClients()
  const victim = getAddress(wallet.account.address)
  const chainId = await publicClient.getChainId()

  console.log(`[${networkName}] chainId=${chainId} account=${victim}`)

  const router = await viem.getContractAt('SalvageRecoveryRouter', ROUTER)
  const vault  = await viem.getContractAt('MockStrandedVault', VAULT)
  const token  = await viem.getContractAt('MockERC20', TOKEN)

  const vaultBalanceBefore = await token.read.balanceOf([VAULT])
  console.log(`vault balance before: ${vaultBalanceBefore}`)

  // 1. Sign the EIP-712 claim (victim === finder-less, 95/5 split)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)
  const signature = await wallet.signTypedData({
    account: wallet.account,
    domain: {
      name: 'SalvageRecoveryRouter', version: '1', chainId,
      verifyingContract: ROUTER,
    },
    types: {
      RecoveryClaim: [
        { name: 'token', type: 'address' }, { name: 'victim', type: 'address' },
        { name: 'finder', type: 'address' }, { name: 'lossTxHash', type: 'bytes32' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'RecoveryClaim',
    message: {
      token: TOKEN, victim, finder: '0x0000000000000000000000000000000000000000' as Address,
      lossTxHash: LOSS_TX, deadline,
    },
  })

  // 2. Register the claim on-chain
  const registerHash = await router.write.registerClaim(
    [TOKEN, victim, '0x0000000000000000000000000000000000000000', LOSS_TX, deadline, signature]
  )
  console.log(`registerClaim tx: ${registerHash}`)
  const registerReceipt = await publicClient.waitForTransactionReceipt({ hash: registerHash })
  console.log(`registered in block ${registerReceipt.blockNumber}, status: ${registerReceipt.status}`)

  const logs = await publicClient.getContractEvents({
    address: ROUTER, abi: router.abi, eventName: 'ClaimRegistered',
    fromBlock: registerReceipt.blockNumber, toBlock: registerReceipt.blockNumber,
  })
  const claimId  = (logs[0].args as any).claimId as `0x${string}`
  const receiver = getAddress((logs[0].args as any).receiver as Address)
  console.log(`claimId: ${claimId}`)
  console.log(`receiver (deposit address): ${receiver}`)

  // 3. Fire the rescue calldata as a raw transaction — the exact mechanism
  //    OwnerClaimPanel's "Send" button uses (sendTransaction to the
  //    stranded contract, not a typed contract write).
  const rescueCalldata = encodeFunctionData({
    abi: vault.abi, functionName: 'rescueERC20',
    args: [TOKEN, receiver, vaultBalanceBefore],
  })
  const sendHash = await wallet.sendTransaction({
    account: wallet.account, to: VAULT, data: rescueCalldata,
  })
  console.log(`rescue send tx: ${sendHash}`)
  const sendReceipt = await publicClient.waitForTransactionReceipt({ hash: sendHash })
  console.log(`rescue confirmed in block ${sendReceipt.blockNumber}, status: ${sendReceipt.status}`)
  if (sendReceipt.status !== 'success') {
    throw new Error('Rescue transaction reverted on real Arc Testnet — this is exactly the case the Send button\'s receipt-status check exists for.')
  }

  const receiverBalance = await token.read.balanceOf([receiver])
  console.log(`receiver balance after rescue: ${receiverBalance} (expect ${vaultBalanceBefore})`)

  // 4. Settle — permissionless, no signature needed
  const settleHash = await router.write.settle([claimId])
  console.log(`settle tx: ${settleHash}`)
  const settleReceipt = await publicClient.waitForTransactionReceipt({ hash: settleHash })
  console.log(`settled in block ${settleReceipt.blockNumber}, status: ${settleReceipt.status}`)

  const victimBalance   = await token.read.balanceOf([victim])
  const protocolBalance = await token.read.balanceOf([PROTOCOL])
  console.log(`victim balance after settle: ${victimBalance}`)
  console.log(`protocol balance after settle: ${protocolBalance}`)
  console.log('(victim === protocolFeeRecipient here, so this address collects both the 95% and 5% shares — same as the Base live test)')
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
