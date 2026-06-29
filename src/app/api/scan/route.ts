import { NextRequest, NextResponse } from 'next/server'
import { scanContract } from '@/lib/scanner'
import { isValidAddress } from '@/lib/utils'
import { Chain, ScanApiResponse } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { address, chain } = body as { address: string; chain: Chain }

    // Validate inputs
    if (!address || !isValidAddress(address)) {
      return NextResponse.json<ScanApiResponse>(
        { success: false, error: 'Invalid contract address. Must be a valid 0x Ethereum address.' },
        { status: 400 }
      )
    }

    if (!chain || !['eth', 'base'].includes(chain)) {
      return NextResponse.json<ScanApiResponse>(
        { success: false, error: 'Invalid chain. Must be "eth" or "base".' },
        { status: 400 }
      )
    }

    // Confirm API keys are configured
    if (!process.env.ALCHEMY_ETH_RPC || !process.env.ALCHEMY_BASE_RPC) {
      return NextResponse.json<ScanApiResponse>(
        { success: false, error: 'RPC endpoints not configured. Check .env.local.' },
        { status: 500 }
      )
    }
    if (!process.env.ETHERSCAN_API_KEY) {
      return NextResponse.json<ScanApiResponse>(
        { success: false, error: 'Etherscan API key not configured. Check .env.local.' },
        { status: 500 }
      )
    }

    // Run the scan
    const result = await scanContract(address, chain)

    return NextResponse.json<ScanApiResponse>({ success: true, result })
  } catch (error) {
    console.error('[/api/scan] Error:', error)
    return NextResponse.json<ScanApiResponse>(
      { success: false, error: 'Scan failed. Check server logs.' },
      { status: 500 }
    )
  }
}