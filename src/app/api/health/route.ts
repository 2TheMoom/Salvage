import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: '0.1.0',
    env: {
      alchemy_eth:  !!process.env.ALCHEMY_ETH_RPC,
      alchemy_base: !!process.env.ALCHEMY_BASE_RPC,
      etherscan:    !!process.env.ETHERSCAN_API_KEY,
      founder:      !!process.env.NEXT_PUBLIC_FOUNDER_ADDRESS,
    },
  })
}