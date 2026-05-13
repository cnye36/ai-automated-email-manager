'use client'
import { useState, useEffect } from 'react'

interface Contact {
  id: number
  firstName: string | null
  lastName: string | null
  primaryEmail: string
  companyName: string | null
  title: string | null
  status: string | null
  sequenceStep: number | null
  assignedInboxId: string | null
  nextSendDate: number | null
  industry: string | null
  city: string | null
  state: string | null
}

const STATUSES = ['all', 'pending', 'active', 'replied', 'bounced', 'unsubscribed', 'complete', 'error']

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-700 text-gray-300',
  active: 'bg-blue-900 text-blue-300',
  replied: 'bg-green-900 text-green-300',
  bounced: 'bg-red-900 text-red-300',
  unsubscribed: 'bg-orange-900 text-orange-300',
  complete: 'bg-purple-900 text-purple-300',
  error: 'bg-red-900 text-red-300',
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const limit = 50

  async function load(p = page, s = status) {
    setLoading(true)
    const res = await fetch(`/api/contacts?page=${p}&limit=${limit}&status=${s}`)
    const data = await res.json()
    setContacts(data.contacts)
    setTotal(data.total)
    setLoading(false)
  }

  useEffect(() => { load(1, status) }, [status])

  function changeStatus(s: string) {
    setStatus(s)
    setPage(1)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Contacts</h1>
        <span className="text-sm text-gray-400">{total.toLocaleString()} total</span>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => changeStatus(s)}
            className={`px-3 py-1 rounded text-xs font-medium capitalize transition-colors ${
              status === s
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : (
        <>
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase border-b border-gray-800">
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Email</th>
                  <th className="text-left px-4 py-3">Company</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Step</th>
                  <th className="text-left px-4 py-3">Inbox</th>
                  <th className="text-left px-4 py-3">Next Send</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-800/40">
                    <td className="px-4 py-2.5 text-gray-200 whitespace-nowrap">
                      {c.firstName} {c.lastName}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-indigo-300 whitespace-nowrap">
                      {c.primaryEmail}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs max-w-[140px] truncate">
                      {c.companyName || '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[c.status || 'pending'] || 'bg-gray-700 text-gray-300'}`}>
                        {c.status || 'pending'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-center">
                      {c.sequenceStep || 0}/3
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {c.assignedInboxId || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                      {c.nextSendDate
                        ? new Date(c.nextSendDate * 1000).toLocaleDateString()
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => { const p = Math.max(1, page - 1); setPage(p); load(p) }}
                disabled={page === 1}
                className="px-3 py-1 text-sm bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700 text-gray-300"
              >
                ← Prev
              </button>
              <span className="text-sm text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); load(p) }}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700 text-gray-300"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
