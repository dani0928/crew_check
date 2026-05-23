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
  // upsert handles race conditions: if another request already created the session, returns existing id
  const { data, error } = await sb
    .from('sessions')
    .upsert({ date }, { onConflict: 'date' })
    .select('id')
    .single()
  if (error) return { error: error.message }
  return { sessionId: data?.id }
}

export async function markAttendance(sessionId: number, memberId: number): Promise<{ error?: string }> {
  const { error } = await admin().from('attendance').insert({ session_id: sessionId, member_id: memberId })
  if (error) return { error: error.message }
  return {}
}
