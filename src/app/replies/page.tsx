import { db } from '@/lib/db/client'
import { contacts, replyEvents } from '@/lib/db/schema'
import { desc, eq, sql } from 'drizzle-orm'
import { getInboxConfigs } from '@/lib/config'
import RepliesManager from '@/components/RepliesManager'

export const dynamic = 'force-dynamic'

async function getReplies() {
  const inboxMap = new Map(getInboxConfigs().map((inbox) => [inbox.id, inbox.address]))
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: replyEvents.id,
        contactId: replyEvents.contactId,
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
      .limit(50),
    db.select({ count: sql<number>`count(*)` }).from(replyEvents),
  ])

  return {
    replies: rows.map((row) => ({
      ...row,
      inboxAddress: inboxMap.get(row.inboxId) || row.inboxId,
    })),
    total: total.count,
  }
}

export default async function RepliesPage() {
  const { replies, total } = await getReplies()
  return <RepliesManager initialReplies={replies} initialTotal={total} />
}
