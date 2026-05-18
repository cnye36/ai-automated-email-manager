'use server'

import { revalidatePath } from 'next/cache'
import { buildAndRunSendQueue } from '@/lib/scheduler'
import { checkAllReplies } from '@/lib/imap'

export async function runSendQueueAction(dryRun: boolean) {
  try {
    await checkAllReplies()
    const result = await buildAndRunSendQueue(dryRun)
    revalidatePath('/')
    revalidatePath('/contacts')
    revalidatePath('/campaigns')
    revalidatePath('/replies')
    return { ok: true as const, result }
  } catch (err) {
    console.error('Send action error:', err)
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function checkRepliesAction() {
  try {
    const results = await checkAllReplies()
    const totalReplies = results.reduce((sum, row) => sum + row.replies, 0)
    const totalNewReplies = results.reduce((sum, row) => sum + row.newReplies, 0)
    revalidatePath('/')
    revalidatePath('/contacts')
    revalidatePath('/replies')
    return { ok: true as const, results, totalReplies, totalNewReplies }
  } catch (err) {
    console.error('Reply action error:', err)
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
  }
}
