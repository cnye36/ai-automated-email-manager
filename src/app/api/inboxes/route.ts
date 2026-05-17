import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { inboxes, sentEmails } from '@/lib/db/schema'
import { getInboxConfigs } from '@/lib/config'
import { getDailyLimit, getWarmupDay } from '@/lib/warmup'
import { and, count, eq, isNotNull } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
  const configs = getInboxConfigs()
  const rows = await db.select().from(inboxes)
  const rowMap = new Map(rows.map((r) => [r.id, r]))

  const result = await Promise.all(configs.map(async (config) => {
    const row = rowMap.get(config.id)
    const totalSent = row?.totalSent ?? 0

    const [[opens], [replies], [bounces]] = await Promise.all([
      db.select({ count: count() }).from(sentEmails).where(and(eq(sentEmails.inboxId, config.id), isNotNull(sentEmails.openedAt))),
      db.select({ count: count() }).from(sentEmails).where(and(eq(sentEmails.inboxId, config.id), isNotNull(sentEmails.repliedAt))),
      db.select({ count: count() }).from(sentEmails).where(and(eq(sentEmails.inboxId, config.id), isNotNull(sentEmails.bouncedAt))),
    ])

    return {
      id: config.id,
      address: config.address,
      active: row?.active ?? config.active,
      warmupStartDate: config.warmupStartDate,
      warmupDay: getWarmupDay(config.warmupStartDate),
      dailyLimit: getDailyLimit(config.warmupStartDate),
      sentToday: row?.sentToday ?? 0,
      totalSent,
      bounceCount: row?.bounceCount ?? 0,
      opens: opens.count,
      replies: replies.count,
      bounces: bounces.count,
      openRate: totalSent > 0 ? ((opens.count / totalSent) * 100).toFixed(1) : '0.0',
      replyRate: totalSent > 0 ? ((replies.count / totalSent) * 100).toFixed(1) : '0.0',
      bounceRate: totalSent > 0 ? ((bounces.count / totalSent) * 100).toFixed(1) : '0.0',
    }
  }))

  return NextResponse.json(result)
}

export async function PATCH(req: NextRequest) {
  const { id, active } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (typeof active !== 'boolean') return NextResponse.json({ error: 'Missing active boolean' }, { status: 400 })

  const config = getInboxConfigs().find((inbox) => inbox.id === id)
  if (!config) return NextResponse.json({ error: 'Unknown inbox id' }, { status: 404 })

  await db
    .insert(inboxes)
    .values({
      id: config.id,
      address: config.address,
      warmupStartDate: config.warmupStartDate,
      active,
    })
    .onConflictDoUpdate({
      target: inboxes.id,
      set: { active },
    })
  return NextResponse.json({ ok: true })
}
