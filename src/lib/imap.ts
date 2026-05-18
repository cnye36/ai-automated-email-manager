import { ImapFlow } from 'imapflow'
import { db } from './db/client'
import { sentEmails, contacts, replyEvents, inboxes } from './db/schema'
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
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

interface BounceMatch {
  sentEmailId: number
  contactId: number | null
  inboxId: string
  bouncedAt: number
  bounceReason: string
}

const BOUNCE_FROM_PATTERNS = [
  /^mailer-daemon@/i,
  /^postmaster@/i,
  /^noreply@.*bounce/i,
]

const BOUNCE_SUBJECT_PATTERNS = [
  /delivery status notification/i,
  /delivery failure/i,
  /mail delivery failed/i,
  /undeliverable/i,
  /failure notice/i,
  /returned mail/i,
  /mail delivery subsystem/i,
]

function isBounceMessage(fromAddr: string, subject: string): boolean {
  return (
    BOUNCE_FROM_PATTERNS.some((p) => p.test(fromAddr)) ||
    BOUNCE_SUBJECT_PATTERNS.some((p) => p.test(subject))
  )
}

function extractMessageIds(text: string): string[] {
  const ids: string[] = []
  const re = /<([^<>\s@,]+@[^<>\s,]+)>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    ids.push(m[1].trim())
  }
  return ids
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
        .where(and(
          eq(sentEmails.inboxId, inboxId),
          isNotNull(sentEmails.messageId),
          isNull(sentEmails.repliedAt)
        ))

      const messageIdMap = new Map(
        pendingSent.map((s) => [s.messageId!, s])
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

export async function checkBouncesForInbox(inboxId: string): Promise<BounceMatch[]> {
  const configs = getActiveInboxConfigs()
  const config = configs.find((c) => c.id === inboxId)
  if (!config) return []

  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: true,
    auth: { user: config.username, pass: config.password },
    logger: false,
  })

  const bounces: BounceMatch[] = []

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')

    try {
      const pendingSent = await db
        .select()
        .from(sentEmails)
        .where(and(
          eq(sentEmails.inboxId, inboxId),
          isNotNull(sentEmails.messageId),
          isNull(sentEmails.bouncedAt)
        ))

      if (pendingSent.length === 0) return []

      const messageIdMap = new Map(
        pendingSent.map((s) => [s.messageId!.replace(/[<>]/g, ''), s])
      )

      const since = new Date()
      since.setDate(since.getDate() - 30)

      for await (const msg of client.fetch(
        { since },
        { envelope: true, headers: true, source: { maxLength: 8000 } }
      )) {
        const fromAddr = msg.envelope?.from?.[0]?.address || ''
        const subject = msg.envelope?.subject || ''
        if (!isBounceMessage(fromAddr, subject)) continue

        const rawHeaders = msg.headers?.toString() || ''
        const sourceText = msg.source?.toString() || ''
        const foundIds = extractMessageIds(rawHeaders + '\n' + sourceText)

        for (const foundId of foundIds) {
          const sent = messageIdMap.get(foundId)
          if (sent) {
            bounces.push({
              sentEmailId: sent.id,
              contactId: sent.contactId,
              inboxId,
              bouncedAt: Math.floor(Date.now() / 1000),
              bounceReason: `${fromAddr}: ${subject}`.substring(0, 500),
            })
            break
          }
        }
      }
    } finally {
      lock.release()
    }
    await client.logout()
  } catch (err) {
    console.error(`IMAP bounce check error for inbox ${inboxId}:`, err)
  }

  return bounces
}

export async function checkAllReplies(): Promise<{ inbox: string; replies: number; newReplies: number; bounces: number; newBounces: number }[]> {
  // Backfill openedAt for any replied emails that slipped through without it
  await db
    .update(sentEmails)
    .set({ openedAt: sql`replied_at` })
    .where(and(isNotNull(sentEmails.repliedAt), isNull(sentEmails.openedAt)))

  const configs = getActiveInboxConfigs()
  const results = []

  for (const config of configs) {
    const [replyMatches, bounceMatches] = await Promise.all([
      checkRepliesForInbox(config.id),
      checkBouncesForInbox(config.id),
    ])
    let newReplies = 0
    let newBounces = 0

    if (replyMatches.length > 0) {
      const now = Math.floor(Date.now() / 1000)

      for (const match of replyMatches) {
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
          .set({
            repliedAt: match.repliedAt,
            // If they replied, they definitely opened it
            openedAt: sql`COALESCE(opened_at, ${match.repliedAt})`,
          })
          .where(eq(sentEmails.id, match.sentEmailId))

        await db
          .update(contacts)
          .set({ status: 'replied', updatedAt: now })
          .where(eq(contacts.id, match.contactId))
      }
    }

    if (bounceMatches.length > 0) {
      const now = Math.floor(Date.now() / 1000)
      const bounceContactIds: number[] = []

      for (const bounce of bounceMatches) {
        const existing = await db
          .select({ id: sentEmails.id })
          .from(sentEmails)
          .where(and(eq(sentEmails.id, bounce.sentEmailId), isNotNull(sentEmails.bouncedAt)))
          .limit(1)

        if (existing.length > 0) continue

        await db
          .update(sentEmails)
          .set({ bouncedAt: bounce.bouncedAt, bounceReason: bounce.bounceReason })
          .where(eq(sentEmails.id, bounce.sentEmailId))

        if (bounce.contactId) bounceContactIds.push(bounce.contactId)
        newBounces++
      }

      if (bounceContactIds.length > 0) {
        await db
          .update(contacts)
          .set({ status: 'bounced', updatedAt: now })
          .where(inArray(contacts.id, bounceContactIds))

        await db
          .update(inboxes)
          .set({ bounceCount: sql`COALESCE(bounce_count, 0) + ${bounceContactIds.length}` })
          .where(eq(inboxes.id, config.id))
      }
    }

    results.push({
      inbox: config.id,
      replies: replyMatches.length,
      newReplies,
      bounces: bounceMatches.length,
      newBounces,
    })
  }

  return results
}
