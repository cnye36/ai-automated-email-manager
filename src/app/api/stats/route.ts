import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { contacts, sentEmails, inboxes } from '@/lib/db/schema'
import { count, gte, isNotNull } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
  const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)

  const [[totalContacts], [sentToday], [totalSent], [totalOpened], [totalReplied], allInboxes] =
    await Promise.all([
      db.select({ count: count() }).from(contacts),
      db.select({ count: count() }).from(sentEmails).where(gte(sentEmails.sentAt, todayStart)),
      db.select({ count: count() }).from(sentEmails),
      db.select({ count: count() }).from(sentEmails).where(isNotNull(sentEmails.openedAt)),
      db.select({ count: count() }).from(sentEmails).where(isNotNull(sentEmails.repliedAt)),
      db.select().from(inboxes),
    ])

  const statusCounts = await db
    .select({ status: contacts.status, count: count() })
    .from(contacts)
    .groupBy(contacts.status)

  return NextResponse.json({
    totalContacts: totalContacts.count,
    sentToday: sentToday.count,
    totalSent: totalSent.count,
    totalOpened: totalOpened.count,
    totalReplied: totalReplied.count,
    openRate: totalSent.count > 0 ? ((totalOpened.count / totalSent.count) * 100).toFixed(1) : '0.0',
    replyRate: totalSent.count > 0 ? ((totalReplied.count / totalSent.count) * 100).toFixed(1) : '0.0',
    statusBreakdown: statusCounts,
    inboxes: allInboxes,
  })
}
