import SignupForm from '@/components/SignupForm'

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-6">
      <SignupForm usesAccessCode={Boolean(process.env.SIGNUP_ACCESS_CODE)} />
    </main>
  )
}
