import { ImapFlow } from 'imapflow'
import { db } from './db/client'
import { sentEmails, contacts, replyEvents } from './db/schema'
import { and, eq } from 'drizzle-orm'
import { getActiveInboxConfigs } from './config'
import { sendNotificationEmail } from './mailer'

interface ReplyMatch {
  contactId: number
  sentEmailId: number
  campaignId: number | null
  repliedAt: number
  providerMessageId: string | null
  fromAddress: string | null
  fromName: string | null
  subject: string | null
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
        const from = msg.envelope?.from?.[0]
        const providerMessageId = msg.envelope?.messageId || null

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
                campaignId: sentEmail.campaignId,
                repliedAt: Math.floor(Date.now() / 1000),
                providerMessageId,
                fromAddress: from?.address || null,
                fromName: from?.name || null,
                subject: msg.envelope?.subject || null,
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

export async function checkAllReplies(): Promise<{ inbox: string; replies: number; newReplies: number }[]> {
  const configs = getActiveInboxConfigs()
  const results = []

  for (const config of configs) {
    const matches = await checkRepliesForInbox(config.id)
    let newReplies = 0

    if (matches.length > 0) {
      const now = Math.floor(Date.now() / 1000)

      // Mark sent_emails as replied
      for (const match of matches) {
        const alreadyStored = match.providerMessageId
          ? await db
              .select({ id: replyEvents.id })
              .from(replyEvents)
              .where(and(
                eq(replyEvents.inboxId, config.id),
                eq(replyEvents.providerMessageId, match.providerMessageId)
              ))
              .limit(1)
          : []

        if (alreadyStored.length === 0) {
          await db.insert(replyEvents).values({
            contactId: match.contactId,
            sentEmailId: match.sentEmailId,
            campaignId: match.campaignId,
            inboxId: config.id,
            providerMessageId: match.providerMessageId,
            fromAddress: match.fromAddress,
            fromName: match.fromName,
            subject: match.subject,
            receivedAt: match.repliedAt,
          }).onConflictDoNothing()
          newReplies++

          await sendNotificationEmail(
            `New campaign reply from ${match.fromAddress || 'unknown sender'}`,
            [
              `Inbox: ${config.address}`,
              `From: ${match.fromName ? `${match.fromName} <${match.fromAddress || ''}>` : match.fromAddress || '-'}`,
              `Subject: ${match.subject || '-'}`,
              '',
              'Open the Replies page in the app to disposition this lead.',
            ].join('\n')
          )
        }

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

    results.push({ inbox: config.id, replies: matches.length, newReplies })
  }

  return results
}
