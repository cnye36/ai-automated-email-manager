import nodemailer from 'nodemailer'
import { getInboxConfig } from './config'

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
const REPLY_TO = process.env.REPLY_TO_EMAIL || 'cnye36@gmail.com'

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
      from: config.address,
      to: opts.to,
      subject: opts.subject,
      html: buildHtml(opts.html, opts.trackingPixelId),
      replyTo: opts.replyTo || REPLY_TO,
      headers: {
        'X-Mailer': 'ai-automatedhq-sender',
      },
    })

    return { success: true, messageId: info.messageId }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// Random delay between sends to avoid spam triggers (ms)
export function randomDelay(minSeconds = 45, maxSeconds = 120): Promise<void> {
  const ms = (minSeconds + Math.random() * (maxSeconds - minSeconds)) * 1000
  return new Promise((res) => setTimeout(res, ms))
}
