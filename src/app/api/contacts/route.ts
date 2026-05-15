import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { campaigns, contacts } from '@/lib/db/schema'
import { and, eq, count, sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

const ALLOWED_STATUSES = new Set([
  'pending',
  'active',
  'replied',
  'interested',
  'not_interested',
  'do_not_contact',
  'bounced',
  'unsubscribed',
  'complete',
  'error',
])

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const campaignIdParam = searchParams.get('campaignId')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = (page - 1) * limit

  const conditions = []
  if (status && status !== 'all') conditions.push(eq(contacts.status, status))
  if (campaignIdParam && campaignIdParam !== 'all') {
    const campaignId = Number(campaignIdParam)
    if (!Number.isInteger(campaignId) || campaignId <= 0) {
      return NextResponse.json({ error: 'Invalid campaignId' }, { status: 400 })
    }
    conditions.push(eq(contacts.campaignId, campaignId))
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : sql`1=1`

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: contacts.id,
        campaignId: contacts.campaignId,
        campaignName: campaigns.name,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        primaryEmail: contacts.primaryEmail,
        companyName: contacts.companyName,
        title: contacts.title,
        status: contacts.status,
        sequenceStep: contacts.sequenceStep,
        assignedInboxId: contacts.assignedInboxId,
        nextSendDate: contacts.nextSendDate,
        notes: contacts.notes,
        industry: contacts.industry,
        city: contacts.city,
        state: contacts.state,
      })
      .from(contacts)
      .leftJoin(campaigns, eq(contacts.campaignId, campaigns.id))
      .where(whereClause)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(contacts)
      .where(whereClause),
  ])

  return NextResponse.json({ contacts: rows, total: total.count, page, limit })
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id = Number(body.id)
    const status = typeof body.status === 'string' ? body.status : null
    const notes = typeof body.notes === 'string' ? body.notes.trim() : undefined

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid contact id' }, { status: 400 })
    }
    if (!status || !ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const stopsSequence = !['pending', 'active'].includes(status)
    const values: {
      status: string
      notes?: string
      nextSendDate?: number | null
      updatedAt: number
    } = {
      status,
      updatedAt: Math.floor(Date.now() / 1000),
    }

    if (notes !== undefined) values.notes = notes
    if (stopsSequence) values.nextSendDate = null

    await db
      .update(contacts)
      .set(values)
      .where(eq(contacts.id, id))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Contact update error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
