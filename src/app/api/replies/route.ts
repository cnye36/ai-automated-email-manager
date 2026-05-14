import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { contacts, replyEvents } from '@/lib/db/schema'
import { desc, eq, sql } from 'drizzle-orm'
import { getInboxConfigs } from '@/lib/config'

export const dynamic = 'force-dynamic'

const CONTACT_STATUSES = new Set([
  'replied',
  'interested',
  'not_interested',
  'do_not_contact',
  'unsubscribed',
])

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = (page - 1) * limit
  const inboxMap = new Map(getInboxConfigs().map((inbox) => [inbox.id, inbox.address]))

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: replyEvents.id,
        contactId: replyEvents.contactId,
        campaignId: replyEvents.campaignId,
        inboxId: replyEvents.inboxId,
        fromAddress: replyEvents.fromAddress,
        fromName: replyEvents.fromName,
        subject: replyEvents.subject,
        receivedAt: replyEvents.receivedAt,
        disposition: replyEvents.disposition,
        notes: replyEvents.notes,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactEmail: contacts.primaryEmail,
        companyName: contacts.companyName,
        contactStatus: contacts.status,
      })
      .from(replyEvents)
      .leftJoin(contacts, eq(replyEvents.contactId, contacts.id))
      .orderBy(desc(replyEvents.receivedAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(replyEvents),
  ])

  return NextResponse.json({
    replies: rows.map((row) => ({
      ...row,
      inboxAddress: inboxMap.get(row.inboxId) || row.inboxId,
    })),
    total: total.count,
    page,
    limit,
  })
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id = Number(body.id)
    const disposition = typeof body.disposition === 'string' ? body.disposition : null
    const notes = typeof body.notes === 'string' ? body.notes.trim() : undefined

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid reply id' }, { status: 400 })
    }
    if (!disposition || !CONTACT_STATUSES.has(disposition)) {
      return NextResponse.json({ error: 'Invalid disposition' }, { status: 400 })
    }

    const [reply] = await db.select().from(replyEvents).where(eq(replyEvents.id, id)).limit(1)
    if (!reply) return NextResponse.json({ error: 'Reply not found' }, { status: 404 })

    await db
      .update(replyEvents)
      .set({ disposition, notes })
      .where(eq(replyEvents.id, id))

    if (reply.contactId) {
      await db
        .update(contacts)
        .set({
          status: disposition,
          notes,
          nextSendDate: null,
          updatedAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(contacts.id, reply.contactId))
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Reply update error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
