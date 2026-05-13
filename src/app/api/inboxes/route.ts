import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { inboxes } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getInboxConfigs } from '@/lib/config'
import { getDailyLimit, getWarmupDay } from '@/lib/warmup'

export async function GET() {
  const configs = getInboxConfigs()
  const rows = await db.select().from(inboxes).all()
  const rowMap = new Map(rows.map((r) => [r.id, r]))

  const result = configs.map((config) => {
    const row = rowMap.get(config.id)
    return {
      id: config.id,
      address: config.address,
      active: config.active,
      warmupStartDate: config.warmupStartDate,
      warmupDay: getWarmupDay(config.warmupStartDate),
      dailyLimit: getDailyLimit(config.warmupStartDate),
      sentToday: row?.sentToday ?? 0,
      totalSent: row?.totalSent ?? 0,
    }
  })

  return NextResponse.json(result)
}

export async function PATCH(req: NextRequest) {
  const { id, active } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  await db.update(inboxes).set({ active }).where(eq(inboxes.id, id))
  return NextResponse.json({ ok: true })
}
