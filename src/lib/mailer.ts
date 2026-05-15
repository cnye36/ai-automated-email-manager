import nodemailer from 'nodemailer'
import { getActiveInboxConfigs, getInboxConfig } from './config'

export interface SendEmailOptions {
  inboxId: string
  to: string
  subject: string
  html: string
  trackingPixelId?: string
  replyTo?: string
}

export interface SendResult {
  success: boolean
  messageId?: string
  error?: string
}

const TRACKING_BASE_URL = process.env.TRACKING_BASE_URL || 'https://track.ai-automatedhq.com'
const REPLY_TO = process.env.REPLY_TO_EMAIL || null
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || process.env.REPLY_NOTIFICATION_EMAIL || null
const SENDER_DISPLAY_NAME = process.env.SENDER_DISPLAY_NAME?.trim() || 'Curtis from AI-Automated'

function formatFromAddress(address: string) {
  return { name: SENDER_DISPLAY_NAME, address }
}

function buildHtml(html: string, trackingPixelId?: string): string {
  const pixel = trackingPixelId
    ? `<img src="${TRACKING_BASE_URL}/api/track/${trackingPixelId}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;" />`
    : ''
  // Ensure HTML body closes before pixel
  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixel}</body>`)
  }
  return `<html><body>${html}${pixel}</body></html>`
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendResult> {
  const config = getInboxConfig(opts.inboxId)
  if (!config) {
    return { success: false, error: `No config found for inbox: ${opts.inboxId}` }
  }

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: false,
    auth: {
      user: config.username,
      pass: config.password,
    },
    tls: { rejectUnauthorized: false },
  })

  try {
    const info = await transporter.sendMail({
      from: formatFromAddress(config.address),
      to: opts.to,
      subject: opts.subject,
      html: buildHtml(opts.html, opts.trackingPixelId),
      replyTo: opts.replyTo || REPLY_TO || config.address,
      headers: {
        'X-Mailer': 'ai-automatedhq-sender',
      },
    })

    return { success: true, messageId: info.messageId }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function sendNotificationEmail(subject: string, text: string): Promise<SendResult> {
  if (!NOTIFICATION_EMAIL) return { success: true }

  const config = getInboxConfig(process.env.NOTIFICATION_INBOX_ID || '')
    || getInboxConfig(process.env.DEFAULT_NOTIFICATION_INBOX_ID || '')
    || getActiveInboxConfigs()[0]

  if (!config) {
    return { success: false, error: 'No notification inbox configured' }
  }

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: false,
    auth: {
      user: config.username,
      pass: config.password,
    },
    tls: { rejectUnauthorized: false },
  })

  try {
    const info = await transporter.sendMail({
      from: formatFromAddress(config.address),
      to: NOTIFICATION_EMAIL,
      subject,
      text,
      replyTo: config.address,
      headers: {
        'X-Mailer': 'ai-automatedhq-sender',
      },
    })

    return { success: true, messageId: info.messageId }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

function sendDelayBounds() {
  const min = Number(process.env.SEND_DELAY_MIN_SECONDS ?? 20)
  const max = Number(process.env.SEND_DELAY_MAX_SECONDS ?? 45)
  return { min: Math.max(0, min), max: Math.max(min, max) }
}

/** Pause between sends (warmup spacing). Defaults 20–45s; override via env. */
export function randomDelay(minSeconds?: number, maxSeconds?: number): Promise<void> {
  const bounds = sendDelayBounds()
  const min = minSeconds ?? bounds.min
  const max = maxSeconds ?? bounds.max
  if (max <= 0) return Promise.resolve()
  const ms = (min + Math.random() * (max - min)) * 1000
  return new Promise((res) => setTimeout(res, ms))
}
