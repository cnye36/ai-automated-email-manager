import { ImapFlow } from 'imapflow'
import { db } from './db/client'
import { sentEmails, contacts } from './db/schema'
import { eq, isNull, inArray } from 'drizzle-orm'
import { getActiveInboxConfigs } from './config'

interface ReplyMatch {
  contactId: number
  sentEmailId: number
  repliedAt: number
}

export async function checkRepliesForInbox(inboxId: string): Promise<ReplyMatch[]> {
  const configs = getActiveInboxConfigs()
  const config = configs.find((c) => c.id === inboxId)
  if (!config) return []

  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: true,
    auth: {
      user: config.username,
      pass: config.password,
    },
    logger: false,
  })

  const matches: ReplyMatch[] = []

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')

    try {
      // Get all sent messageIds for this inbox that haven't been marked as replied
      const pendingSent = await db
        .select()
        .from(sentEmails)
        .where(eq(sentEmails.inboxId, inboxId))
        .all()

      const messageIdMap = new Map(
        pendingSent
          .filter((s) => s.messageId && !s.repliedAt)
          .map((s) => [s.messageId!, s])
      )

      if (messageIdMap.size === 0) {
        return []
      }

      // Search for messages received in the last 30 days
      const since = new Date()
      since.setDate(since.getDate() - 30)

      for await (const msg of client.fetch({ since }, { envelope: true, headers: ['in-reply-to', 'references'] })) {
        const rawHeaders = msg.headers?.toString() || ''
        const inReplyTo = rawHeaders.match(/^in-reply-to:\s*(.+)$/im)?.[1]?.trim() || ''
        const references = rawHeaders.match(/^references:\s*(.+)$/im)?.[1]?.trim() || ''

        // Check if any sent messageId is referenced
        for (const [msgId, sentEmail] of messageIdMap) {
          const cleanMsgId = msgId.replace(/[<>]/g, '')
          if (
            inReplyTo.includes(cleanMsgId) ||
            references.includes(cleanMsgId)
          ) {
            if (sentEmail.contactId) {
              matches.push({
                contactId: sentEmail.contactId,
                sentEmailId: sentEmail.id,
                repliedAt: Math.floor(Date.now() / 1000),
              })
            }
          }
        }
      }
    } finally {
      lock.release()
    }
    await client.logout()
  } catch (err) {
    console.error(`IMAP error for inbox ${inboxId}:`, err)
  }

  return matches
}

export async function checkAllReplies(): Promise<{ inbox: string; replies: number }[]> {
  const configs = getActiveInboxConfigs()
  const results = []

  for (const config of configs) {
    const matches = await checkRepliesForInbox(config.id)

    if (matches.length > 0) {
      const now = Math.floor(Date.now() / 1000)

      // Mark sent_emails as replied
      for (const match of matches) {
        await db
          .update(sentEmails)
          .set({ repliedAt: match.repliedAt })
          .where(eq(sentEmails.id, match.sentEmailId))

        // Mark contact as replied and stop their sequence
        await db
          .update(contacts)
          .set({ status: 'replied', updatedAt: now })
          .where(eq(contacts.id, match.contactId))
      }
    }

    results.push({ inbox: config.id, replies: matches.length })
  }

  return results
}
