/** Stored on reply_events.disposition (not always equal to contacts.status). */
export const REPLY_DISPOSITIONS = [
  { value: 'replied', label: 'Needs Review' },
  { value: 'automatic_reply', label: 'Automatic Reply' },
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'do_not_contact', label: 'Do Not Contact' },
  { value: 'unsubscribed', label: 'Unsubscribed' },
] as const

export type ReplyDisposition = (typeof REPLY_DISPOSITIONS)[number]['value']

const ALLOWED = new Set<string>(REPLY_DISPOSITIONS.map((d) => d.value))

export function isValidReplyDisposition(value: string): value is ReplyDisposition {
  return ALLOWED.has(value)
}

/** Select value for replies UI (legacy rows may still have needs_review). */
export function replyDispositionSelectValue(
  disposition: string | null,
  contactStatus: string | null,
): string {
  if (disposition && isValidReplyDisposition(disposition)) return disposition
  if (contactStatus && ALLOWED.has(contactStatus)) return contactStatus
  return 'replied'
}
