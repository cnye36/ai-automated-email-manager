import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { campaignInboxes } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getInboxConfigs } from '@/lib/config'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const campaignId = Number(req.nextUrl.searchParams.get('campaignId'))
  if (!campaignId) return NextResponse.json({ error: 'Missing campaignId' }, { status: 400 })

  const rows = await db
    .select({ inboxId: campaignInboxes.inboxId })
    .from(campaignInboxes)
    .where(eq(campaignInboxes.campaignId, campaignId))

  return NextResponse.json({ inboxIds: rows.map((r) => r.inboxId) })
}

export async function PUT(req: NextRequest) {
  try {
    const { campaignId, inboxIds } = await req.json()
    if (!Number.isInteger(Number(campaignId))) {
      return NextResponse.json({ error: 'Invalid campaignId' }, { status: 400 })
    }
    if (!Array.isArray(inboxIds)) {
      return NextResponse.json({ error: 'inboxIds must be an array' }, { status: 400 })
    }

    const id = Number(campaignId)
    const validIds = getInboxConfigs().map((c) => c.id)
    const filtered = inboxIds.filter((i: unknown) => typeof i === 'string' && validIds.includes(i))

    await db.delete(campaignInboxes).where(eq(campaignInboxes.campaignId, id))

    if (filtered.length > 0) {
      await db.insert(campaignInboxes).values(
        filtered.map((inboxId: string) => ({ campaignId: id, inboxId }))
      )
    }

    return NextResponse.json({ ok: true, assignedInboxIds: filtered })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
