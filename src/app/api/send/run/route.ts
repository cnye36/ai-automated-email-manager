import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { buildAndRunSendQueue } from '@/lib/scheduler'
import { tryAcquireSendLock, releaseSendLock } from '@/lib/send-lock'
import { getCampaignAutomationOverview } from '@/lib/campaign-overview'
import { parseSendQueueOptionsFromBody } from '@/lib/send-options'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const dryRun = body.dryRun === true
  let devOptions
  try {
    devOptions = parseSendQueueOptionsFromBody(body as Record<string, unknown>) ?? undefined
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 403 },
    )
  }

  if (!dryRun && !devOptions) {
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

  if (devOptions && devOptions.campaignIds?.length) {
    const overview = await getCampaignAutomationOverview()
    const liveIds = new Set(overview.liveCampaigns.map((c) => c.id))
    const missing = devOptions.campaignIds.filter((id) => !liveIds.has(id))
    if (missing.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Campaign(s) ${missing.join(', ')} are not live (paused, complete, or missing). Unpause the test campaign first.`,
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
    const result = await buildAndRunSendQueue(dryRun, devOptions)
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
