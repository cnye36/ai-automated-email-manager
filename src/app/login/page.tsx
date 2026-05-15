import LoginForm from '@/components/LoginForm'

type LoginPageProps = {
  searchParams: Promise<{
    next?: string
  }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const nextPath = typeof params.next === 'string' && params.next.startsWith('/') ? params.next : '/'

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-6">
      <LoginForm nextPath={nextPath} />
    </main>
  )
}
