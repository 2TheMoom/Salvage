import { ethers } from 'hardhat'

async function main() {
  // Protocol fee recipient = your founder wallet
  const PROTOCOL_FEE_RECIPIENT = '0x8a485a86393d9e218c888a24d281f2df5bc37265'

  const Router = await ethers.getContractFactory('SalvageRecoveryRouter')
  const router = await Router.deploy(PROTOCOL_FEE_RECIPIENT)
  await router.waitForDeployment()

  const addr = await router.getAddress()
  console.log('SalvageRecoveryRouter deployed to:', addr)
  console.log('Protocol fee recipient:', PROTOCOL_FEE_RECIPIENT)
  console.log(`Verify: npx hardhat verify --network base ${addr} ${PROTOCOL_FEE_RECIPIENT}`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })