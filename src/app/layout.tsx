import type { Metadata } from 'next'
import AppShell from '@/components/AppShell'
import './globals.css'

export const metadata: Metadata = {
  title: 'Email Sender — ai-automatedhq',
  description: 'Campaign management & sending dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full flex bg-gray-950 text-gray-100">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
