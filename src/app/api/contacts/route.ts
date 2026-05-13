import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { contacts } from '@/lib/db/schema'
import { eq, like, count, sql } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = (page - 1) * limit

  const conditions = status && status !== 'all' ? [eq(contacts.status, status)] : []

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        primaryEmail: contacts.primaryEmail,
        companyName: contacts.companyName,
        title: contacts.title,
        status: contacts.status,
        sequenceStep: contacts.sequenceStep,
        assignedInboxId: contacts.assignedInboxId,
        nextSendDate: contacts.nextSendDate,
        industry: contacts.industry,
        city: contacts.city,
        state: contacts.state,
      })
      .from(contacts)
      .where(conditions.length > 0 ? conditions[0] : sql`1=1`)
      .limit(limit)
      .offset(offset)
      .all(),
    db
      .select({ count: count() })
      .from(contacts)
      .where(conditions.length > 0 ? conditions[0] : sql`1=1`),
  ])

  return NextResponse.json({ contacts: rows, total: total.count, page, limit })
}
