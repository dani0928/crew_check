'use server'

import { createClient } from '@supabase/supabase-js'

const MAX_SCORE = 9999

export async function submitGameScore(
  memberName: string,
  score: number,
  gameType: 'dino' | 'flappy' = 'dino'
): Promise<{ error?: string }> {
  // 점수 유효성 검증
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
    return { error: '유효하지 않은 점수입니다.' }
  }

  // 멤버 이름 검증: anon 키로 public SELECT 사용 (항상 동작)
  const supabaseAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: member } = await supabaseAnon
    .from('members')
    .select('id')
    .eq('name', memberName)
    .maybeSingle()

  if (!member) {
    return { error: '크루원 명단에 없는 이름입니다.' }
  }

  // INSERT: service role 키 사용
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await supabaseAdmin
    .from('game_scores')
    .insert({ member_name: memberName, score, game_type: gameType })

  if (error) return { error: error.message }
  return {}
}
