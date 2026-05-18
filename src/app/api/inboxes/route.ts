import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { inboxes, sentEmails } from '@/lib/db/schema'
import { getInboxConfigs } from '@/lib/config'
import {
  getDailyLimit,
  getWarmupDay,
  isValidWarmupStartDate,
  warmupStartDateForTargetDay,
  warmupStartDateToday,
} from '@/lib/warmup'
import { getEffectiveDailyLimit, isValidDailySendTarget } from '@/lib/inbox-send-limit'
import { resolveWarmupStartDate } from '@/lib/inbox-warmup'
import { todayInSendTimezone } from '@/lib/send-timezone'
import { and, count, eq, isNotNull } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
  const configs = getInboxConfigs()
  const rows = await db.select().from(inboxes)
  const rowMap = new Map(rows.map((r) => [r.id, r]))

  const result = await Promise.all(configs.map(async (config) => {
    const row = rowMap.get(config.id)
    const warmupStartDate = resolveWarmupStartDate(config.id, row?.warmupStartDate, config.warmupStartDate)
    const totalSent = row?.totalSent ?? 0

    const [[opens], [replies], [bounces]] = await Promise.all([
      db.select({ count: count() }).from(sentEmails).where(and(eq(sentEmails.inboxId, config.id), isNotNull(sentEmails.openedAt))),
      db.select({ count: count() }).from(sentEmails).where(and(eq(sentEmails.inboxId, config.id), isNotNull(sentEmails.repliedAt))),
      db.select({ count: count() }).from(sentEmails).where(and(eq(sentEmails.inboxId, config.id), isNotNull(sentEmails.bouncedAt))),
    ])

    const warmupMaxLimit = getDailyLimit(warmupStartDate)
    const dailySendTarget = row?.dailySendTarget ?? null
    const effectiveDailyLimit = getEffectiveDailyLimit(warmupStartDate, dailySendTarget)

    return {
      id: config.id,
      address: config.address,
      active: row?.active ?? config.active,
      warmupStartDate,
      warmupDay: getWarmupDay(warmupStartDate),
      warmupMaxLimit,
      dailySendTarget,
      effectiveDailyLimit,
      /** @deprecated use effectiveDailyLimit */
      dailyLimit: effectiveDailyLimit,
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
  const body = await req.json()
  const { id, active, warmupStartDate, warmupDay, resetSentToday, dailySendTarget } = body as {
    id?: string
    active?: boolean
    warmupStartDate?: string
    warmupDay?: number
    resetSentToday?: boolean
    dailySendTarget?: number | null
  }

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const config = getInboxConfigs().find((inbox) => inbox.id === id)
  if (!config) return NextResponse.json({ error: 'Unknown inbox id' }, { status: 404 })

  const hasActive = typeof active === 'boolean'
  const hasWarmupDay = typeof warmupDay === 'number' && Number.isFinite(warmupDay)
  const hasWarmupDate = typeof warmupStartDate === 'string'
  const hasReset = resetSentToday === true
  const hasSendTarget = dailySendTarget === null || typeof dailySendTarget === 'number'

  if (!hasActive && !hasWarmupDay && !hasWarmupDate && !hasReset && !hasSendTarget) {
    return NextResponse.json(
      { error: 'Provide active, warmupDay, warmupStartDate, dailySendTarget, and/or resetSentToday' },
      { status: 400 },
    )
  }

  let resolvedWarmupDate: string | undefined
  if (hasWarmupDay) {
    if (warmupDay! < 1 || warmupDay! > 365) {
      return NextResponse.json({ error: 'warmupDay must be between 1 and 365' }, { status: 400 })
    }
    resolvedWarmupDate = warmupStartDateForTargetDay(warmupDay!)
  } else if (hasWarmupDate) {
    if (!isValidWarmupStartDate(warmupStartDate!)) {
      return NextResponse.json({ error: 'warmupStartDate must be YYYY-MM-DD' }, { status: 400 })
    }
    resolvedWarmupDate = warmupStartDate!
  }

  const today = todayInSendTimezone()
  const update: Record<string, unknown> = {}
  if (hasActive) update.active = active
  if (resolvedWarmupDate) update.warmupStartDate = resolvedWarmupDate
  if (hasReset) {
    update.sentToday = 0
    update.lastSentDate = today
  }
  if (hasSendTarget) {
    update.dailySendTarget = dailySendTarget === null ? null : Math.floor(dailySendTarget!)
  }

  const [existing] = await db.select().from(inboxes).where(eq(inboxes.id, id))
  const finalDatePreview = resolvedWarmupDate ?? existing?.warmupStartDate ?? config.warmupStartDate
  const warmupMaxPreview = getDailyLimit(finalDatePreview)

  if (hasSendTarget && dailySendTarget !== null) {
    if (!isValidDailySendTarget(dailySendTarget, warmupMaxPreview)) {
      return NextResponse.json(
        { error: `dailySendTarget must be between 1 and ${warmupMaxPreview} (warmup max)` },
        { status: 400 },
      )
    }
  }

  await db
    .insert(inboxes)
    .values({
      id: config.id,
      address: config.address,
      warmupStartDate: resolvedWarmupDate ?? existing?.warmupStartDate ?? config.warmupStartDate,
      active: hasActive ? active! : (existing?.active ?? config.active),
      sentToday: hasReset ? 0 : (existing?.sentToday ?? 0),
      lastSentDate: hasReset ? today : existing?.lastSentDate,
    })
    .onConflictDoUpdate({
      target: inboxes.id,
      set: update,
    })

  const finalDate = resolvedWarmupDate ?? existing?.warmupStartDate ?? config.warmupStartDate
  const [updated] = await db.select().from(inboxes).where(eq(inboxes.id, id))
  const warmupMaxLimit = getDailyLimit(finalDate)
  const target = updated?.dailySendTarget ?? null
  const effectiveDailyLimit = getEffectiveDailyLimit(finalDate, target)

  return NextResponse.json({
    ok: true,
    warmupStartDate: finalDate,
    warmupDay: getWarmupDay(finalDate),
    warmupMaxLimit,
    dailySendTarget: target,
    effectiveDailyLimit,
    dailyLimit: effectiveDailyLimit,
  })
}

/** Reset every configured inbox to warmup day 1 (today) and clear today's send count. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  if (body.action !== 'reset-all-warmup') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const configs = getInboxConfigs()
  const today = warmupStartDateToday()
  const todayLabel = todayInSendTimezone()

  for (const config of configs) {
    await db
      .insert(inboxes)
      .values({
        id: config.id,
        address: config.address,
        warmupStartDate: today,
        active: config.active,
        sentToday: 0,
        lastSentDate: todayLabel,
      })
      .onConflictDoUpdate({
        target: inboxes.id,
        set: {
          warmupStartDate: today,
          sentToday: 0,
          lastSentDate: todayLabel,
        },
      })
  }

  return NextResponse.json({ ok: true, warmupStartDate: today, inboxCount: configs.length })
}
