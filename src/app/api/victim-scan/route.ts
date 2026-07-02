import { NextRequest, NextResponse } from 'next/server'
import { scanVictimWallet } from '@/lib/victim'
import { isValidAddress } from '@/lib/utils'
import { Chain, VictimScanApiResponse } from '@/types'

// Never cache anything about this route — every scan must be live.
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
// Transfer-history pagination + per-finding verification + contract triage
// needs more than the default 10s.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { address, chain } = body as { address: string; chain: Chain }

    if (!address || !isValidAddress(address)) {
      return NextResponse.json<VictimScanApiResponse>(
        { success: false, error: 'Invalid wallet address. Must be a valid 0x Ethereum address.' },
        { status: 400 }
      )
    }

    if (!chain || !['eth', 'base'].includes(chain)) {
      return NextResponse.json<VictimScanApiResponse>(
        { success: false, error: 'Invalid chain. Must be "eth" or "base".' },
        { status: 400 }
      )
    }

    const result = await scanVictimWallet(address, chain)
    console.log(
      `[victim-scan] ${chain}:${address} → findings=${result.findings.length} totalLostUsd=${result.totalLostUsd.toFixed(2)}`
    )

    return NextResponse.json<VictimScanApiResponse>({ success: true, result })
  } catch (err) {
    console.error('[victim-scan] error:', err)
    return NextResponse.json<VictimScanApiResponse>(
      { success: false, error: 'Scan failed. Please try again.' },
      { status: 500 }
    )
  }
}