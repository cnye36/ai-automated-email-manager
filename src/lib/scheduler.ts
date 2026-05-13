import { db } from './db/client'
import { contacts, sentEmails, inboxes } from './db/schema'
import { eq, lte, and, inArray, isNull, sql } from 'drizzle-orm'
import { sendEmail, randomDelay } from './mailer'
import { getDailyLimit } from './warmup'
import { getActiveInboxConfigs } from './config'
import { v4 as uuidv4 } from 'uuid'
import { format } from 'date-fns'

const SEQUENCE_DELAY_DAYS = 3 // days between sequence steps

export interface SendRunResult {
  sent: number
  failed: number
  skipped: number
  details: Array<{ contactId: number; inboxId: string; step: number; success: boolean; error?: string }>
}

function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

async function resetDailyCountsIfNeeded() {
  const today = todayStr()
  await db
    .update(inboxes)
    .set({ sentToday: 0, lastSentDate: today })
    .where(sql`last_sent_date != ${today} OR last_sent_date IS NULL`)
}

async function syncInboxesFromConfig() {
  const configs = getActiveInboxConfigs()
  for (const config of configs) {
    await db
      .insert(inboxes)
      .values({
        id: config.id,
        address: config.address,
        warmupStartDate: config.warmupStartDate,
        active: config.active,
      })
      .onConflictDoUpdate({
        target: inboxes.id,
        set: {
          address: config.address,
          active: config.active,
        },
      })
  }
}

export async function buildAndRunSendQueue(dryRun = false): Promise<SendRunResult> {
  await syncInboxesFromConfig()
  await resetDailyCountsIfNeeded()

  const configs = getActiveInboxConfigs()
  const result: SendRunResult = { sent: 0, failed: 0, skipped: 0, details: [] }
  const now = Math.floor(Date.now() / 1000)
  const today = todayStr()

  // Build per-inbox budget
  const budgets = new Map<string, number>()
  for (const config of configs) {
    const [row] = await db.select().from(inboxes).where(eq(inboxes.id, config.id))
    const limit = getDailyLimit(config.warmupStartDate)
    const sentSoFar = row?.sentToday ?? 0
    const remaining = Math.max(0, limit - sentSoFar)
    if (remaining > 0) budgets.set(config.id, remaining)
  }

  const totalBudget = Array.from(budgets.values()).reduce((a, b) => a + b, 0)
  if (totalBudget === 0) {
    console.log('All inboxes at daily limit.')
    return result
  }

  // 1. Activate pending contacts that haven't started yet (assign to inbox)
  const inboxIds = configs.map((c) => c.id)
  const pendingContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.status, 'pending'))
    .limit(totalBudget)
    .all()

  // Round-robin assign
  const inboxQueue = [...inboxIds]
  for (const contact of pendingContacts) {
    if (inboxQueue.length === 0) break
    const inboxId = inboxQueue[0]
    inboxQueue.push(inboxQueue.shift()!) // rotate
    await db
      .update(contacts)
      .set({ status: 'active', assignedInboxId: inboxId, nextSendDate: now, updatedAt: now })
      .where(eq(contacts.id, contact.id))
  }

  // 2. Get contacts due to send (active, nextSendDate <= now)
  const due = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.status, 'active'), lte(contacts.nextSendDate, now)))
    .all()

  // Group by assigned inbox
  const byInbox = new Map<string, typeof due>()
  for (const contact of due) {
    const id = contact.assignedInboxId || inboxIds[0]
    if (!byInbox.has(id)) byInbox.set(id, [])
    byInbox.get(id)!.push(contact)
  }

  // 3. Send
  for (const [inboxId, contactList] of byInbox) {
    const budget = budgets.get(inboxId) || 0
    const toSend = contactList.slice(0, budget)

    for (const contact of toSend) {
      const step = (contact.sequenceStep ?? 0) + 1

      let subject: string | null = null
      let body: string | null = null

      if (step === 1) { subject = contact.email1Subject; body = contact.email1Body }
      else if (step === 2) { subject = contact.email2Subject; body = contact.email2Body }
      else if (step === 3) { subject = contact.email3Subject; body = contact.email3Body }

      if (!subject || !body || !contact.primaryEmail) {
        result.skipped++
        continue
      }

      const trackingPixelId = uuidv4()
      const nextDelay = step < 3 ? SEQUENCE_DELAY_DAYS * 24 * 60 * 60 : null

      if (!dryRun) {
        const sendResult = await sendEmail({
          inboxId,
          to: contact.primaryEmail,
          subject,
          html: body,
          trackingPixelId,
        })

        const sentNow = Math.floor(Date.now() / 1000)

        await db.insert(sentEmails).values({
          contactId: contact.id,
          inboxId,
          campaignId: contact.campaignId,
          sequenceStep: step,
          subject,
          messageId: sendResult.messageId,
          trackingPixelId,
          sentAt: sentNow,
          error: sendResult.error,
        })

        const newStatus = !sendResult.success
          ? 'error'
          : step >= 3
          ? 'complete'
          : 'active'

        await db
          .update(contacts)
          .set({
            sequenceStep: step,
            status: newStatus,
            nextSendDate: nextDelay ? sentNow + nextDelay : null,
            updatedAt: sentNow,
          })
          .where(eq(contacts.id, contact.id))

        if (sendResult.success) {
          await db
            .update(inboxes)
            .set({
              sentToday: sql`sent_today + 1`,
              totalSent: sql`total_sent + 1`,
              lastSentDate: today,
            })
            .where(eq(inboxes.id, inboxId))

          result.sent++
        } else {
          result.failed++
        }

        result.details.push({
          contactId: contact.id,
          inboxId,
          step,
          success: sendResult.success,
          error: sendResult.error,
        })

        if (toSend.indexOf(contact) < toSend.length - 1) {
          await randomDelay()
        }
      } else {
        result.sent++
        result.details.push({ contactId: contact.id, inboxId, step, success: true })
      }
    }
  }

  return result
}
