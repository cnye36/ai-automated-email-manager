import { db } from './db/client'
import { contacts, sentEmails, inboxes } from './db/schema'
import { eq, lte, and, sql } from 'drizzle-orm'
import { sendEmail, randomDelay } from './mailer'
import { ensureEmailBodyHtmlForSend } from './email-body'
import { getDailyLimit } from './warmup'
import { getInboxConfigs } from './config'
import type { InboxConfig } from './config'
import { v4 as uuidv4 } from 'uuid'
import { format } from 'date-fns'

const SEQUENCE_DELAY_DAYS = 3 // days between sequence steps
const SEND_WINDOW_START_HOUR = Number(process.env.SEND_WINDOW_START_HOUR ?? 8)
const SEND_WINDOW_END_HOUR = Number(process.env.SEND_WINDOW_END_HOUR ?? 18)
const SEND_WEEKDAYS_ONLY = process.env.SEND_WEEKDAYS_ONLY !== 'false'

export interface SendRunResult {
  sent: number
  failed: number
  skipped: number
  blockedReason?: string
  details: Array<{ contactId: number; inboxId: string; step: number; success: boolean; error?: string }>
}

function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function isAllowedSendTime(date: Date): boolean {
  const day = date.getDay()
  const hour = date.getHours()
  const isWeekend = day === 0 || day === 6

  if (SEND_WEEKDAYS_ONLY && isWeekend) return false
  return hour >= SEND_WINDOW_START_HOUR && hour < SEND_WINDOW_END_HOUR
}

function nextAllowedSendAt(date: Date): number {
  const candidate = new Date(date)

  if (isAllowedSendTime(candidate)) {
    return Math.floor(candidate.getTime() / 1000)
  }

  candidate.setMinutes(Math.floor(Math.random() * 45), Math.floor(Math.random() * 60), 0)

  while (true) {
    const day = candidate.getDay()
    const isWeekend = day === 0 || day === 6
    const hour = candidate.getHours()

    if (SEND_WEEKDAYS_ONLY && isWeekend) {
      candidate.setDate(candidate.getDate() + (day === 6 ? 2 : 1))
      candidate.setHours(SEND_WINDOW_START_HOUR, Math.floor(Math.random() * 45), 0, 0)
      continue
    }

    if (hour < SEND_WINDOW_START_HOUR) {
      candidate.setHours(SEND_WINDOW_START_HOUR, Math.floor(Math.random() * 45), 0, 0)
      continue
    }

    if (hour >= SEND_WINDOW_END_HOUR) {
      candidate.setDate(candidate.getDate() + 1)
      candidate.setHours(SEND_WINDOW_START_HOUR, Math.floor(Math.random() * 45), 0, 0)
      continue
    }

    return Math.floor(candidate.getTime() / 1000)
  }
}

export function getSendWindowSummary() {
  return {
    startHour: SEND_WINDOW_START_HOUR,
    endHour: SEND_WINDOW_END_HOUR,
    weekdaysOnly: SEND_WEEKDAYS_ONLY,
  }
}

async function resetDailyCountsIfNeeded() {
  const today = todayStr()
  await db
    .update(inboxes)
    .set({ sentToday: 0, lastSentDate: today })
    .where(sql`last_sent_date != ${today} OR last_sent_date IS NULL`)
}

async function syncInboxesFromConfig() {
  const configs = getInboxConfigs()
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
        },
      })
  }
}

async function getActiveInboxRuntimeConfigs(): Promise<InboxConfig[]> {
  const configs = getInboxConfigs()
  const rows = await db.select().from(inboxes)
  const rowMap = new Map(rows.map((row) => [row.id, row]))

  return configs.filter((config) => rowMap.get(config.id)?.active ?? config.active)
}

export async function buildAndRunSendQueue(dryRun = false): Promise<SendRunResult> {
  await syncInboxesFromConfig()
  await resetDailyCountsIfNeeded()

  const configs = await getActiveInboxRuntimeConfigs()
  const result: SendRunResult = { sent: 0, failed: 0, skipped: 0, details: [] }
  const nowDate = new Date()
  const now = Math.floor(nowDate.getTime() / 1000)
  const today = todayStr()

  if (!isAllowedSendTime(nowDate)) {
    result.blockedReason = `Outside send window (${SEND_WINDOW_START_HOUR}:00-${SEND_WINDOW_END_HOUR}:00${SEND_WEEKDAYS_ONLY ? ', Monday-Friday' : ''})`
    return result
  }

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

  // Round-robin assign
  const inboxQueue = [...inboxIds]
  for (const contact of pendingContacts) {
    if (inboxQueue.length === 0) break
    const inboxId = inboxQueue[0]
    inboxQueue.push(inboxQueue.shift()!) // rotate
    await db
      .update(contacts)
      .set({ status: 'active', assignedInboxId: inboxId, nextSendDate: nextAllowedSendAt(nowDate), updatedAt: now })
      .where(eq(contacts.id, contact.id))
  }

  // 2. Get contacts due to send (active, nextSendDate <= now)
  const due = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.status, 'active'), lte(contacts.nextSendDate, now)))

  // Group by assigned inbox
  const byInbox = new Map<string, typeof due>()
  for (const contact of due) {
    const id = contact.assignedInboxId || inboxIds[0]
    if (!byInbox.has(id)) byInbox.set(id, [])
    byInbox.get(id)!.push(contact)
  }

  // Per-inbox capped lists, then merge in round-robin order (A1, B1, C1, A2, …)
  // so one inbox does not exhaust its budget in a tight burst before others send.
  const perInboxQueues = new Map<string, typeof due>()
  for (const inboxId of inboxIds) {
    const contactList = byInbox.get(inboxId) ?? []
    const budget = budgets.get(inboxId) || 0
    const slice = contactList.slice(0, budget)
    if (slice.length > 0) {
      perInboxQueues.set(inboxId, [...slice])
    }
  }

  const sendQueue: Array<{ inboxId: string; contact: (typeof due)[0] }> = []
  while (true) {
    let progressed = false
    for (const inboxId of inboxIds) {
      const q = perInboxQueues.get(inboxId)
      if (!q?.length) continue
      sendQueue.push({ inboxId, contact: q.shift()! })
      progressed = true
    }
    if (!progressed) break
  }

  // 3. Send (interleaved across inboxes; delay between each step in the merged queue)
  for (let i = 0; i < sendQueue.length; i++) {
    const { inboxId, contact } = sendQueue[i]!
    const step = (contact.sequenceStep ?? 0) + 1

    let subject: string | null = null
    let body: string | null = null

    if (step === 1) { subject = contact.email1Subject; body = contact.email1Body }
    else if (step === 2) { subject = contact.email2Subject; body = contact.email2Body }
    else if (step === 3) { subject = contact.email3Subject; body = contact.email3Body }

    if (!subject || !body || !contact.primaryEmail) {
      result.skipped++
    } else {
      const trackingPixelId = uuidv4()
      const nextSendDate = step < 3
        ? nextAllowedSendAt(new Date((Math.floor(Date.now() / 1000) + SEQUENCE_DELAY_DAYS * 24 * 60 * 60) * 1000))
        : null

      if (!dryRun) {
        const htmlBody = await ensureEmailBodyHtmlForSend(body)

        const sendResult = await sendEmail({
          inboxId,
          to: contact.primaryEmail,
          subject,
          html: htmlBody,
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
            nextSendDate,
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
      } else {
        result.sent++
        result.details.push({ contactId: contact.id, inboxId, step, success: true })
      }
    }

    if (!dryRun && i < sendQueue.length - 1) {
      await randomDelay()
    }
  }

  return result
}
