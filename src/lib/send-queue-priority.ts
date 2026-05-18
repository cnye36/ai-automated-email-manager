import type { Contact } from './db/schema'

/** Follow-ups (sequence step ≥ 1) before new outreach (step 0); oldest due first within each group. */
export function prioritizeDueContacts<T extends Pick<Contact, 'sequenceStep' | 'nextSendDate'>>(contacts: T[]): T[] {
  return [...contacts].sort((a, b) => {
    const aFollow = (a.sequenceStep ?? 0) >= 1 ? 1 : 0
    const bFollow = (b.sequenceStep ?? 0) >= 1 ? 1 : 0
    if (bFollow !== aFollow) return bFollow - aFollow
    return (a.nextSendDate ?? 0) - (b.nextSendDate ?? 0)
  })
}

export function isFollowUpDue(contact: Pick<Contact, 'sequenceStep'>): boolean {
  return (contact.sequenceStep ?? 0) >= 1
}
