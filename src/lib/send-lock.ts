import { db } from './db/client'
import { sendLocks } from './db/schema'
import { eq, sql } from 'drizzle-orm'

const GLOBAL_LOCK_ID = 'global'
const LOCK_TTL_SECONDS = 360

export async function tryAcquireSendLock(): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + LOCK_TTL_SECONDS

  await db
    .delete(sendLocks)
    .where(sql`${sendLocks.expiresAt} <= ${now}`)

  const inserted = await db
    .insert(sendLocks)
    .values({ id: GLOBAL_LOCK_ID, lockedAt: now, expiresAt })
    .onConflictDoNothing()
    .returning()

  return inserted.length > 0
}

export async function releaseSendLock() {
  await db.delete(sendLocks).where(eq(sendLocks.id, GLOBAL_LOCK_ID))
}

export async function getSendLockStatus() {
  const now = Math.floor(Date.now() / 1000)
  const [row] = await db.select().from(sendLocks).where(eq(sendLocks.id, GLOBAL_LOCK_ID))

  if (!row || row.expiresAt <= now) {
    if (row) await releaseSendLock()
    return { running: false as const }
  }

  return {
    running: true as const,
    lockedAt: row.lockedAt,
    expiresAt: row.expiresAt,
  }
}
