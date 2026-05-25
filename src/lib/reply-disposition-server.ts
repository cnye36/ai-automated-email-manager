import { db } from './db/client'
import { contacts, sentEmails } from './db/schema'
import { desc, eq } from 'drizzle-orm'
import { nextAllowedSendAt, nextSequenceSendAt } from './scheduler'

/** Resume outreach after an OOO / autoresponder (sequence continues). */
export async function resumeContactAfterAutomaticReply(contactId: number) {
  const now = Math.floor(Date.now() / 1000)
  const nowDate = new Date()

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1)
  if (!contact) return

  if ((contact.sequenceStep ?? 0) >= 3) {
    await db
      .update(contacts)
      .set({ status: 'complete', nextSendDate: null, updatedAt: now })
      .where(eq(contacts.id, contactId))
    return
  }

  const [lastSent] = await db
    .select({ sentAt: sentEmails.sentAt })
    .from(sentEmails)
    .where(eq(sentEmails.contactId, contactId))
    .orderBy(desc(sentEmails.sentAt))
    .limit(1)

  let nextSendDate = lastSent?.sentAt
    ? nextSequenceSendAt(new Date(lastSent.sentAt * 1000))
    : nextAllowedSendAt(nowDate)

  if (nextSendDate <= now) {
    nextSendDate = nextAllowedSendAt(nowDate)
  }

  await db
    .update(contacts)
    .set({ status: 'active', nextSendDate, updatedAt: now })
    .where(eq(contacts.id, contactId))
}
