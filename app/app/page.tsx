// 크루원 출석 체크인 메인 페이지
'use client'

import { useEffect, useState } from 'react'
import { supabase, Member } from '@/lib/supabase'

const LOGO_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/Booster.jpg`
const VIDEO_INTRO = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/BOOSTER_INTRO.webm`
const VIDEO_BG = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/STG_shine.webm`

function getKSTNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
}

function isCheckinOpen(): boolean {
  if (process.env.NODE_ENV === 'development') return true
  const now = getKSTNow()
  const day = now.getDay()
  const total = now.getHours() * 60 + now.getMinutes()
  return (day === 1 || day === 3) && total >= 20 * 60 && total < 20 * 60 + 30
}

function getTodayKST(): string {
  return getKSTNow().toISOString().slice(0, 10)
}

const ADMIN_NAMES = ['권경민', '박진혁', '백인경', '이종남', '최석진', '하이안', '황진석']

type Step = 'search' | 'done'

export default function HomePage() {
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [checkedInIds, setCheckedInIds] = useState<Set<number>>(new Set())
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [step, setStep] = useState<Step>('search')
  const [doneName, setDoneName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setOpen(isCheckinOpen())
    const t = setInterval(() => setOpen(isCheckinOpen()), 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!open) { setLoading(false); return }
    loadData()
  }, [open])

  async function loadData() {
    setLoading(true)
    const today = getTodayKST()
    const { data: existing } = await supabase.from('sessions').select('id').eq('date', today).single()
    let sid = existing?.id
    if (!sid) {
      const { data: created } = await supabase.from('sessions').insert({ date: today }).select('id').single()
      sid = created?.id
    }
    setSessionId(sid ?? null)

    const [{ data: membersData }, { data: attendanceData }] = await Promise.all([
      supabase.from('members').select('*').order('name'),
      sid ? supabase.from('attendance').select('member_id').eq('session_id', sid) : Promise.resolve({ data: [] }),
    ])
    setMembers(membersData ?? [])
    setCheckedInIds(new Set((attendanceData ?? []).map((a: { member_id: number }) => a.member_id)))
    setLoading(false)
  }

  useEffect(() => {
    if (step !== 'done') return
    const t = setTimeout(() => {
      setStep('search')
      setQuery('')
      setDoneName('')
    }, 5000)
    return () => clearTimeout(t)
  }, [step])

  async function handleSelect(member: Member) {
    if (!sessionId) return
    if (checkedInIds.has(member.id)) return
    await supabase.from('attendance').insert({ session_id: sessionId, member_id: member.id })
    setCheckedInIds(prev => new Set(prev).add(member.id))
    setDoneName(member.name)
    setStep('done')
  }

  const filtered = query.trim()
    ? members.filter(m => m.name.includes(query.trim()))
    : []

  if (!open) {
    return (
      <main className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden bg-black">
        <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover object-center" src={VIDEO_INTRO} />
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 flex flex-col items-center text-center">
          <img src={LOGO_URL} alt="로고" className="w-20 h-20 object-contain mb-6" />
          <p className="text-xl font-bold text-white">러닝크루 부스터</p>
          <p className="text-sm text-white/60 mt-2">매주 월·수 오후 8:00 ~ 8:30</p>
        </div>
      </main>
    )
  }

  if (step === 'done') {
    const confettiItems = [
      { color: '#22c55e', tx: '-60px', ty: '-80px', tr: '-30deg' },
      { color: '#3b82f6', tx: '60px',  ty: '-80px', tr: '30deg'  },
      { color: '#f59e0b', tx: '-80px', ty: '-20px', tr: '-60deg' },
      { color: '#ef4444', tx: '80px',  ty: '-20px', tr: '60deg'  },
      { color: '#a855f7', tx: '-40px', ty: '-100px',tr: '20deg'  },
      { color: '#ec4899', tx: '40px',  ty: '-100px',tr: '-20deg' },
      { color: '#06b6d4', tx: '-90px', ty: '-50px', tr: '45deg'  },
      { color: '#f97316', tx: '90px',  ty: '-50px', tr: '-45deg' },
    ]
    return (
      <main className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center overflow-hidden">
        <style>{`
          @keyframes circlePop {
            0%   { transform: scale(0); opacity: 0; }
            60%  { transform: scale(1.15); opacity: 1; }
            80%  { transform: scale(0.95); }
            100% { transform: scale(1); }
          }
          @keyframes checkDraw {
            from { stroke-dashoffset: 50; }
            to   { stroke-dashoffset: 0; }
          }
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(12px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes confettiFly {
            0%   { opacity: 1; transform: translate(0,0) rotate(0deg) scale(1); }
            100% { opacity: 0; transform: translate(var(--tx), var(--ty)) rotate(var(--tr)) scale(0.4); }
          }
        `}</style>

        <div className="relative flex items-center justify-center mb-8">
          {confettiItems.map((c, i) => (
            <div key={i} style={{
              position: 'absolute',
              width: 10, height: 10,
              borderRadius: 3,
              backgroundColor: c.color,
              '--tx': c.tx, '--ty': c.ty, '--tr': c.tr,
              animation: 'confettiFly 0.8s cubic-bezier(0.25,0.46,0.45,0.94) 0.2s forwards',
              opacity: 0,
            } as React.CSSProperties} />
          ))}
          <div style={{ animation: 'circlePop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards' }}
            className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path
                d="M5 13l4 4L19 7"
                style={{
                  strokeDasharray: 50,
                  strokeDashoffset: 50,
                  animation: 'checkDraw 0.4s ease-out 0.35s forwards',
                }}
              />
            </svg>
          </div>
        </div>
        <p style={{ opacity: 0, animation: 'fadeUp 0.4s ease-out 0.55s forwards' }}
          className="text-2xl font-bold text-gray-900 mb-2">{doneName}님, 출석 완료!</p>
        <p style={{ opacity: 0, animation: 'fadeUp 0.4s ease-out 0.7s forwards' }}
          className="text-gray-400 text-base mb-10">오늘도 즐거운 러닝 되세요 🏃</p>
        <button
          onClick={() => { setStep('search'); setQuery(''); setDoneName('') }}
          style={{ opacity: 0, animation: 'fadeUp 0.4s ease-out 0.9s forwards' }}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          ← 처음으로 (5초 후 자동 이동)
        </button>
      </main>
    )
  }

  return (
    <main className="relative min-h-screen px-6 pt-16 pb-10 overflow-hidden bg-black">
      <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover object-center" src={VIDEO_INTRO} />
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative z-10 max-w-sm mx-auto">
        <img src={LOGO_URL} alt="로고" className="w-12 h-12 object-contain mb-6" />
        <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">출석 체크</h1>
        <p className="text-sm font-medium text-white/70 mb-8">이름을 검색해서 출석을 완료하세요.</p>

        <div className="relative mb-3">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="이름 검색"
            autoFocus
            className="w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-5 py-5 text-lg font-bold text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-white/30 transition"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-sm"
            >
              ✕
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-center text-white/30 text-sm font-medium py-10">불러오는 중...</p>
        ) : query.trim() === '' ? (
          <p className="text-center text-white/70 text-sm font-medium py-10">이름을 입력하세요.</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-white/70 text-sm font-medium py-10">검색 결과가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(member => {
              const done = checkedInIds.has(member.id)
              return (
                <button
                  key={member.id}
                  onClick={() => handleSelect(member)}
                  disabled={done}
                  className={`w-full text-left rounded-2xl px-5 py-4 text-base font-normal transition-all flex items-center justify-between backdrop-blur-md border ${
                    done
                      ? 'bg-green-400/15 border-green-400/25 text-green-300 cursor-default'
                      : 'bg-white/10 border-white/20 text-white hover:bg-white/15 active:scale-[0.98]'
                  }`}
                >
                  <span>{member.name}</span>
                  {done && <span className="text-xs font-medium text-green-400">출석 완료 ✓</span>}
                </button>
              )
            })}
          </div>
        )}

        {ADMIN_NAMES.includes(query.trim()) && (
          <div className="mt-4">
            <a
              href="/admin"
              className="flex items-center justify-center w-full rounded-2xl px-5 py-3 text-sm font-medium backdrop-blur-md bg-white/10 border border-white/20 text-white/60 hover:bg-white/15 active:scale-[0.98] transition-all"
            >
              운영진 로그인
            </a>
          </div>
        )}
      </div>
    </main>
  )
}
