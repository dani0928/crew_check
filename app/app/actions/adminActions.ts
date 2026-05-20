'use server'

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function addMember(name: string): Promise<{ error?: string }> {
  if (!name.trim()) return { error: '이름을 입력하세요.' }
  const { error } = await admin().from('members').insert({ name: name.trim() })
  if (error) return { error: error.message }
  return {}
}

export async function deleteMember(id: number): Promise<{ error?: string }> {
  const sb = admin()
  await sb.from('attendance').delete().eq('member_id', id)
  const { error } = await sb.from('members').delete().eq('id', id)
  if (error) return { error: error.message }
  return {}
}

export async function importMembers(names: string[]): Promise<{ error?: string }> {
  if (!names.length) return {}
  const { error } = await admin().from('members').insert(names.map(name => ({ name })))
  if (error) return { error: error.message }
  return {}
}

export async function resetLeaderboard(): Promise<{ error?: string }> {
  const { error } = await admin().from('leaderboard_resets').insert({ reset_at: new Date().toISOString() })
  if (error) return { error: error.message }
  return {}
}
