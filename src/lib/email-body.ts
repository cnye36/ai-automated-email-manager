/**
 * Turn spreadsheet / plain-text email bodies into readable HTML for sending.
 *
 * Env (optional AI polish at send time only):
 * - EMAIL_BODY_LLM_POLISH=true — call OpenAI-compatible chat API before send (plain bodies only)
 * - OPENAI_API_KEY — required when polish is enabled
 * - OPENAI_BASE_URL — default https://api.openai.com/v1
 * - EMAIL_BODY_LLM_MODEL — default gpt-4o-mini
 */

const AUTHOR_TAG_RE =
  /<\/?\s*(p|div|br|table|a|span|strong|em|b|i|ul|ol|li|h[1-6]|blockquote|hr|html|body|head|font|img)\b/i

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function looksLikeAuthorHtml(s: string): boolean {
  return AUTHOR_TAG_RE.test(s)
}

export function wrapEmailBodyShell(innerHtml: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#222222;max-width:36em;">${innerHtml}</div>`
}

/** Deterministic: paragraphs from blank lines, single newlines → &lt;br&gt;, typography wrapper */
export function formatPlainTextToEmailHtml(plain: string): string {
  const normalized = plain.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''
  const escaped = escapeHtml(normalized)
  const blocks = escaped.split(/\n\n+/).map((b) => b.trim()).filter(Boolean)
  const inner = blocks
    .map((block) => {
      const withBreaks = block.split('\n').join('<br />\n')
      return `<p style="margin:0 0 1em 0;">${withBreaks}</p>`
    })
    .join('\n')
  return wrapEmailBodyShell(inner)
}

export function ensureEmailBodyHtmlSync(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  if (looksLikeAuthorHtml(t)) return t
  return formatPlainTextToEmailHtml(t)
}

function stripCodeFences(s: string): string {
  let x = s.trim()
  if (x.startsWith('```')) {
    x = x.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/i, '')
  }
  return x.trim()
}

function stripUnsafeHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
}

function extractBodyFragmentIfFullDoc(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) return bodyMatch[1].trim()
  if (/<\s*html\b/i.test(html)) {
    return html
      .replace(/<\s*html[^>]*>/gi, '')
      .replace(/<\/\s*html\s*>/gi, '')
      .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')
      .trim()
  }
  return html
}

async function polishPlainBodyWithOpenAI(plainText: string): Promise<string | null> {
  if (process.env.EMAIL_BODY_LLM_POLISH !== 'true') return null
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    console.warn('[email-body] EMAIL_BODY_LLM_POLISH=true but OPENAI_API_KEY is missing; skipping LLM')
    return null
  }

  const model = process.env.EMAIL_BODY_LLM_MODEL ?? 'gpt-4o-mini'
  const base = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const url = `${base}/chat/completions`

  const system = `You format cold outreach email bodies as HTML only.
Rules:
- Output a single HTML fragment (no subject line, no greeting line unless it was in the source). No markdown, no code fences.
- Use only simple tags: p, br, strong, em. Optional ul/li for short bullets if the source clearly lists items.
- Tone: warm, professional, concise — like a thoughtful one-to-one email, not marketing fluff. Keep the same facts, names, numbers, and offers as the source. Do not invent details.
- Short paragraphs (2–4 sentences typical). No all-caps emphasis.
- Do not include a signature block unless the source already has one.`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.45,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: plainText.trim() },
      ],
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.warn(`[email-body] LLM request failed ${res.status}: ${errText.slice(0, 200)}`)
    return null
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    console.warn('[email-body] LLM returned empty content')
    return null
  }

  let html = stripCodeFences(content)
  html = extractBodyFragmentIfFullDoc(html)
  html = stripUnsafeHtml(html)
  return html.trim() || null
}

function finalizeLlmHtml(html: string, sourcePlain: string): string {
  const t = html.trim()
  if (!t) return formatPlainTextToEmailHtml(sourcePlain)
  if (looksLikeAuthorHtml(t) || /<[a-z]\b/i.test(t)) {
    return wrapEmailBodyShell(t)
  }
  return formatPlainTextToEmailHtml(t)
}

export async function ensureEmailBodyHtmlForSend(
  raw: string,
  opts?: { dryRun?: boolean }
): Promise<string> {
  const t = raw.trim()
  if (!t) return t
  if (looksLikeAuthorHtml(t)) return t

  const useLlm = process.env.EMAIL_BODY_LLM_POLISH === 'true' && !opts?.dryRun
  if (useLlm) {
    try {
      const polished = await polishPlainBodyWithOpenAI(raw)
      if (polished) return finalizeLlmHtml(polished, raw)
    } catch (e) {
      console.warn('[email-body] LLM polish error:', e)
    }
  }

  return ensureEmailBodyHtmlSync(raw)
}

export function formatCampaignPreviewBodies<T extends { body: string | null }>(emails: T[]): T[] {
  return emails.map((e) => ({
    ...e,
    body: e.body ? ensureEmailBodyHtmlSync(e.body) : null,
  }))
}
