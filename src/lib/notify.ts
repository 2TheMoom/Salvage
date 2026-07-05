import { createClient } from '@supabase/supabase-js'

interface NotifyResult {
  sent: boolean
  reason?: string
}

/**
 * Notify a victim that a finder has registered a recovery claim against
 * their wallet. Looks up the wallet's Base App notification token (saved
 * when they opened the Salvage Mini App) and fires a push via Base's
 * notification endpoint. Silently no-ops if the victim never opened the
 * Mini App or disabled notifications — that's expected, not an error.
 */
export async function notifyVictimOfClaim(
  victimWallet: string,
  tokenSymbol: string,
  valueUsd: number
): Promise<NotifyResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from('miniapp_notifications')
    .select('token, url, enabled')
    .eq('wallet', victimWallet.toLowerCase())
    .single()

  if (error || !data) {
    return { sent: false, reason: 'no notification token for wallet' }
  }
  if (!data.enabled) {
    return { sent: false, reason: 'notifications disabled' }
  }

  // Base's notification endpoint accepts the token + url returned by
  // addFrame, a unique notificationId (for idempotency/dedupe), a title,
  // body, and a targetUrl to open when tapped.
  const notificationId = `claim-${victimWallet.toLowerCase()}-${Date.now()}`

  try {
    const res = await fetch(data.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notificationId,
        title: 'Recoverable funds found',
        body: `Someone found $${valueUsd.toFixed(2)} in ${tokenSymbol} linked to your wallet. Tap to review and recover.`,
        targetUrl: 'https://salvage-miniapp.vercel.app',
        tokens: [data.token],
      }),
    })

    if (!res.ok) {
      return { sent: false, reason: `notify endpoint ${res.status}` }
    }
    return { sent: true }
  } catch (err) {
    console.error('[notify] send failed:', err)
    return { sent: false, reason: 'fetch failed' }
  }
}