'use client'
import { useState, useEffect, useCallback } from 'react'

interface CampaignOption {
  id: number
  name: string
}

interface Contact {
  id: number
  campaignId: number | null
  campaignName: string | null
  firstName: string | null
  lastName: string | null
  primaryEmail: string
  companyName: string | null
  title: string | null
  status: string | null
  sequenceStep: number | null
  assignedInboxId: string | null
  nextSendDate: number | null
  notes: string | null
  industry: string | null
  city: string | null
  state: string | null
}

const STATUSES = ['all', 'pending', 'active', 'replied', 'interested', 'not_interested', 'do_not_contact', 'bounced', 'unsubscribed', 'complete', 'error']
const DISPOSITIONS = [
  { value: 'active', label: 'Active' },
  { value: 'replied', label: 'Replied' },
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'do_not_contact', label: 'Do Not Contact' },
  { value: 'unsubscribed', label: 'Unsubscribed' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'complete', label: 'Complete' },
]

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-700 text-gray-300',
  active: 'bg-blue-900 text-blue-300',
  replied: 'bg-green-900 text-green-300',
  interested: 'bg-emerald-900 text-emerald-300',
  not_interested: 'bg-yellow-900 text-yellow-200',
  do_not_contact: 'bg-red-950 text-red-300',
  bounced: 'bg-red-900 text-red-300',
  unsubscribed: 'bg-orange-900 text-orange-300',
  complete: 'bg-purple-900 text-purple-300',
  error: 'bg-red-900 text-red-300',
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('all')
  const [campaignId, setCampaignId] = useState('all')
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<number | null>(null)
  const limit = 50

  useEffect(() => {
    fetch('/api/campaigns')
      .then((res) => res.json())
      .then((rows: Array<{ id: number; name: string }>) => {
        setCampaigns(rows.map((c) => ({ id: c.id, name: c.name })))
      })
      .catch(() => setCampaigns([]))
  }, [])

  const load = useCallback(async (p: number, s = status, c = campaignId) => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(p),
      limit: String(limit),
      status: s,
      campaignId: c,
    })
    const res = await fetch(`/api/contacts?${params}`)
    const data = await res.json()
    setContacts(data.contacts)
    setTotal(data.total)
    setLoading(false)
  }, [status, campaignId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(1, status, campaignId)
    setPage(1)
  }, [load, status, campaignId])

  function changeStatus(s: string) {
    setStatus(s)
    setPage(1)
  }

  function changeCampaign(c: string) {
    setCampaignId(c)
    setPage(1)
  }

  async function updateContactStatus(contact: Contact, newStatus: string) {
    setUpdating(contact.id)
    try {
      const res = await fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contact.id, status: newStatus, notes: contact.notes || '' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        window.alert(data.error || 'Failed to update contact')
        return
      }
      await load(page, status, campaignId)
    } finally {
      setUpdating(null)
    }
  }

  const totalPages = Math.ceil(total / limit)
  const selectedCampaign = campaigns.find((c) => String(c.id) === campaignId)

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Contacts</h1>
          {selectedCampaign && (
            <p className="text-sm text-gray-400 mt-1">Campaign: {selectedCampaign.name}</p>
          )}
        </div>
        <span className="text-sm text-gray-400">{total.toLocaleString()} matching</span>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="text-xs text-gray-500 uppercase tracking-wider">Campaign</label>
        <select
          value={campaignId}
          onChange={(e) => changeCampaign(e.target.value)}
          className="rounded-md bg-gray-950 border border-gray-700 px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-indigo-500 min-w-[200px]"
        >
          <option value="all">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={String(c.id)}>{c.name}</option>
          ))}
        </select>
      </div>

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
                  {campaignId === 'all' && <th className="text-left px-4 py-3">Campaign</th>}
                  <th className="text-left px-4 py-3">Company</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Step</th>
                  <th className="text-left px-4 py-3">Inbox</th>
                  <th className="text-left px-4 py-3">Next Send</th>
                  <th className="text-left px-4 py-3">Disposition</th>
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
                    {campaignId === 'all' && (
                      <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[140px] truncate">
                        {c.campaignName || '—'}
                      </td>
                    )}
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
                    <td className="px-4 py-2.5">
                      <select
                        value={c.status || 'pending'}
                        onChange={(event) => updateContactStatus(c, event.target.value)}
                        disabled={updating === c.id}
                        className="w-36 rounded-md bg-gray-950 border border-gray-700 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-indigo-500 disabled:opacity-50"
                      >
                        {c.status === 'pending' && <option value="pending">Pending</option>}
                        {DISPOSITIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => { const p = Math.max(1, page - 1); setPage(p); load(p, status, campaignId) }}
                disabled={page === 1}
                className="px-3 py-1 text-sm bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700 text-gray-300"
              >
                ← Prev
              </button>
              <span className="text-sm text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); load(p, status, campaignId) }}
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
