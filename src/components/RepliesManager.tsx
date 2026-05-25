'use client'

import { useState } from 'react'
import { checkRepliesAction } from '@/app/actions'

interface ReplyRow {
  id: number
  contactId: number | null
  inboxId: string
  inboxAddress: string
  fromAddress: string | null
  fromName: string | null
  subject: string | null
  receivedAt: number
  disposition: string | null
  notes: string | null
  contactFirstName: string | null
  contactLastName: string | null
  contactEmail: string | null
  companyName: string | null
  contactStatus: string | null
}

import { REPLY_DISPOSITIONS, replyDispositionSelectValue } from '@/lib/reply-disposition'

export default function RepliesManager({ initialReplies, initialTotal }: {
  initialReplies: ReplyRow[]
  initialTotal: number
}) {
  const [replies, setReplies] = useState(initialReplies)
  const [total, setTotal] = useState(initialTotal)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/replies')
    const data = await res.json()
    setReplies(data.replies || [])
    setTotal(data.total || 0)
    setLoading(false)
  }

  async function checkRepliesNow() {
    setChecking(true)
    setMessage(null)
    try {
      const data = await checkRepliesAction()
      if (!data.ok) {
        setMessage(`Reply check failed: ${data.error}`)
      } else {
        setMessage(`Checked inboxes. Found ${data.totalReplies} matched replies.`)
        await load()
      }
    } finally {
      setChecking(false)
    }
  }

  async function updateDisposition(reply: ReplyRow, disposition: string) {
    setUpdating(reply.id)
    try {
      const res = await fetch('/api/replies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reply.id, disposition, notes: reply.notes || '' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) {
        window.alert(data.error || 'Failed to update reply')
        return
      }
      await load()
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-start justify-between gap-6 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Replies</h1>
          <p className="text-sm text-gray-400 mt-1">{total.toLocaleString()} matched replies across sending inboxes</p>
        </div>
        <button
          onClick={checkRepliesNow}
          disabled={checking}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {checking ? 'Checking...' : 'Check Replies'}
        </button>
      </div>

      {message && <p className="mb-4 text-sm text-gray-300">{message}</p>}

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase border-b border-gray-800">
              <th className="text-left px-4 py-3">Received</th>
              <th className="text-left px-4 py-3">Lead</th>
              <th className="text-left px-4 py-3">Subject</th>
              <th className="text-left px-4 py-3">Source Inbox</th>
              <th className="text-left px-4 py-3">From</th>
              <th className="text-left px-4 py-3">Disposition</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              <tr><td className="px-4 py-4 text-gray-500" colSpan={6}>Loading...</td></tr>
            ) : replies.length === 0 ? (
              <tr><td className="px-4 py-4 text-gray-500" colSpan={6}>No matched replies yet.</td></tr>
            ) : replies.map((reply) => (
              <tr key={reply.id} className="hover:bg-gray-800/40">
                <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                  {new Date(reply.receivedAt * 1000).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <p className="text-gray-100 whitespace-nowrap">
                    {reply.contactFirstName || ''} {reply.contactLastName || ''}
                  </p>
                  <p className="text-xs text-gray-500 font-mono">{reply.contactEmail || '-'}</p>
                  {reply.companyName && <p className="text-xs text-gray-500">{reply.companyName}</p>}
                </td>
                <td className="px-4 py-3 text-gray-300 max-w-[260px] truncate">{reply.subject || '-'}</td>
                <td className="px-4 py-3 text-indigo-300 font-mono text-xs whitespace-nowrap">{reply.inboxAddress}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {reply.fromName && <p className="text-gray-400">{reply.fromName}</p>}
                  <p className="font-mono">{reply.fromAddress || '-'}</p>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={replyDispositionSelectValue(reply.disposition, reply.contactStatus)}
                    onChange={(event) => updateDisposition(reply, event.target.value)}
                    disabled={updating === reply.id}
                    className="w-44 rounded-md bg-gray-950 border border-gray-700 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-indigo-500 disabled:opacity-50"
                  >
                    {REPLY_DISPOSITIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
