'use server'

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function getOrCreateSession(date: string): Promise<{ sessionId?: number; error?: string }> {
  const sb = admin()
  const { data: existing } = await sb.from('sessions').select('id').eq('date', date).single()
  if (existing?.id) return { sessionId: existing.id }
  const { data: created, error } = await sb.from('sessions').insert({ date }).select('id').single()
  if (error) return { error: error.message }
  return { sessionId: created?.id }
}

export async function markAttendance(sessionId: number, memberId: number): Promise<{ error?: string }> {
  const { error } = await admin().from('attendance').insert({ session_id: sessionId, member_id: memberId })
  if (error) return { error: error.message }
  return {}
}
