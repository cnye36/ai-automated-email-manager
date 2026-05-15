import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { buildAndRunSendQueue } from '@/lib/scheduler'
import { tryAcquireSendLock, releaseSendLock } from '@/lib/send-lock'
import { getCampaignAutomationOverview } from '@/lib/campaign-overview'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const dryRun = body.dryRun === true

  if (!dryRun) {
    const overview = await getCampaignAutomationOverview()
    if (!overview.hasLiveCampaigns) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No live campaigns. Import contacts and ensure at least one campaign is not paused with leads remaining.',
        },
        { status: 400 },
      )
    }
  }

  const acquired = await tryAcquireSendLock()
  if (!acquired) {
    return NextResponse.json(
      { ok: false, error: 'A send run is already in progress. Wait for it to finish.' },
      { status: 409 },
    )
  }

  try {
    const result = await buildAndRunSendQueue(dryRun)
    revalidatePath('/')
    revalidatePath('/contacts')
    revalidatePath('/campaigns')
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    console.error('Send run error:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  } finally {
    await releaseSendLock()
  }
}
