// Supabase 클라이언트 싱글톤
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export type Member = {
  id: number
  name: string
  created_at: string
}

export type Session = {
  id: number
  date: string
  created_at: string
}

export type Attendance = {
  id: number
  session_id: number
  member_id: number
  checked_in_at: string
}
