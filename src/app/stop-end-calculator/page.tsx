import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Calculator from './calculator'
import type { User } from '@supabase/supabase-js'

export default async function StopEndCalculatorPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <Calculator user={user} />
}