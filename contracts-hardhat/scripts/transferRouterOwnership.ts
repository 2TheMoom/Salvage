import { network } from 'hardhat'
import { getAddress } from 'viem'

const NEW_OWNER = getAddress('0x542866504A1f38391fF5D22FAa41Ce80c5556Fec') // SafePal hardware wallet

const ROUTER_ADDRESS: Record<string, `0x${string}`> = {
  mainnet: '0xD9A5f1Fcf39F99152d6443132B21C1D8f7fAAC25',
  base:    '0x2240792d1A9D964d238bD693fCb09586B10faEdf',
}

async function main() {
  const { viem, networkName } = await network.connect()
  const routerAddress = ROUTER_ADDRESS[networkName]
  if (!routerAddress) throw new Error(`No router address configured for network "${networkName}"`)

  const router = await viem.getContractAt('SalvageRecoveryRouter', routerAddress)
  const currentOwner = await router.read.owner()
  console.log(`[${networkName}] router: ${routerAddress}`)
  console.log(`[${networkName}] current owner: ${currentOwner}`)

  const hash = await router.write.transferOwnership([NEW_OWNER])
  console.log(`[${networkName}] transferOwnership tx: ${hash}`)

  const publicClient = await viem.getPublicClient()
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log(`[${networkName}] confirmed in block ${receipt.blockNumber}, status: ${receipt.status}`)

  const pending = await router.read.pendingOwner()
  console.log(`[${networkName}] pendingOwner is now: ${pending}`)
  console.log(`[${networkName}] next: from the SafePal (${NEW_OWNER}), call acceptOwnership() on ${routerAddress}`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
