'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(event.currentTarget)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: formData.get('email'),
        password: formData.get('password'),
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const data = await res.json().catch(() => ({}))
    setLoading(false)

    if (!res.ok) {
      setError(data.error || 'Login failed')
      return
    }

    router.replace(nextPath || '/')
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-lg p-6">
      <h1 className="text-xl font-semibold text-white">Sign In</h1>
      <p className="text-sm text-gray-500 mt-1">Access the email sender dashboard.</p>

      <label className="block mt-6">
        <span className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Email</span>
        <input
          name="email"
          type="email"
          required
          className="w-full rounded-md bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500"
        />
      </label>

      <label className="block mt-4">
        <span className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Password</span>
        <input
          name="password"
          type="password"
          required
          className="w-full rounded-md bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500"
        />
      </label>

      {error && <p className="text-sm text-red-300 mt-4">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  )
}
