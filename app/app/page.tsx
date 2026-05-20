'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase, Member } from '@/lib/supabase'
import { DinoGame } from '@/components/DinoGame'
import { FlappyGame } from '@/components/FlappyGame'
import { getOrCreateSession, markAttendance } from '@/app/actions/attendanceActions'

const LOGO_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/Booster.jpg`
const VIDEO_INTRO = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/BOOSTER_INTRO.webm`
const GAME_BG_FRAME = 1
const ADMIN_PIN = '2019'
const ADMIN_NAMES = ['권경민', '박진혁', '백인경', '이종남', '최석진', '하이안', '황진석']

function getKSTNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
}

function getTodayKST(): string {
  return getKSTNow().toISOString().slice(0, 10)
}

// --- Leaderboard ---
type LeaderboardEntry = { name: string; count: number; rank: number }
type GroupedEntry = { rank: number; count: number; names: string[] }
type AttendanceRow = { member_id: number; members: { name: string } | { name: string }[] }

const RANK_MEDAL = ['', '🥇', '🥈', '🥉', '', '']
const RANK_LABEL = ['', '1위', '2위', '3위', '4위', '5위']
const RANK_BADGE_CLASS = [
  '',
  'bg-yellow-400/20 border-yellow-400/40 text-yellow-300',
  'bg-white/10 border-white/25 text-white/70',
  'bg-amber-700/20 border-amber-600/35 text-amber-400',
  'bg-white/5 border-white/15 text-white/50',
  'bg-white/5 border-white/15 text-white/50',
]

function computeRanks(data: AttendanceRow[]): LeaderboardEntry[] {
  const countMap = new Map<number, { name: string; count: number }>()
  for (const row of data) {
    const m = row.members
    const name = Array.isArray(m) ? m[0]?.name : m?.name
    if (!name) continue
    const prev = countMap.get(row.member_id)
    countMap.set(row.member_id, { name, count: (prev?.count ?? 0) + 1 })
  }
  const sorted = [...countMap.values()].sort((a, b) => b.count - a.count)
  const result: LeaderboardEntry[] = []
  let rank = 1
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].count < sorted[i - 1].count) rank++
    if (rank > 5) break
    result.push({ ...sorted[i], rank })
  }
  return result
}

function groupByRank(entries: LeaderboardEntry[]): GroupedEntry[] {
  const map = new Map<number, GroupedEntry>()
  for (const e of entries) {
    const ex = map.get(e.rank)
    if (ex) ex.names.push(e.name)
    else map.set(e.rank, { rank: e.rank, count: e.count, names: [e.name] })
  }
  return [...map.values()]
    .sort((a, b) => a.rank - b.rank)
    .map(g => ({ ...g, names: g.names.sort((a, b) => a.localeCompare(b, 'ko')) }))
}

function Leaderboard({ entries, loading }: { entries: LeaderboardEntry[]; loading: boolean }) {
  const [open, setOpen] = useState(false)
  const grouped = groupByRank(entries)
  return (
    <div className="w-full max-w-sm mx-auto mt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-1 mb-3 group"
      >
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest group-hover:text-white/60 transition-colors">
          누적 출석 순위
        </p>
        <span className={`text-white/30 group-hover:text-white/50 transition-all duration-300 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
        {loading ? (
          <p className="text-center text-white/30 text-sm py-8">불러오는 중...</p>
        ) : grouped.length === 0 ? (
          <p className="text-center text-white/30 text-sm py-8">아직 출석 기록이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {grouped.map(group => {
              const isFirst = group.rank === 1
              const badgeClass = RANK_BADGE_CLASS[group.rank] ?? RANK_BADGE_CLASS[5]
              return (
                <div key={group.rank} className={`flex items-start justify-between rounded-2xl px-5 py-3.5 border backdrop-blur-md ${isFirst ? 'bg-yellow-400/10 border-yellow-400/30' : 'bg-white/5 border-white/10'}`}>
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className={`shrink-0 mt-0.5 text-xs font-bold rounded-full px-2.5 py-1 border ${badgeClass}`}>
                      {RANK_MEDAL[group.rank] ? `${RANK_MEDAL[group.rank]} ${RANK_LABEL[group.rank]}` : RANK_LABEL[group.rank] ?? `${group.rank}위`}
                    </span>
                    <span className={`text-sm font-medium leading-relaxed break-keep ${isFirst ? 'text-yellow-200' : 'text-white/80'}`}>
                      {group.names.join(', ')}
                    </span>
                  </div>
                  <span className={`shrink-0 ml-3 text-sm font-bold tabular-nums mt-0.5 ${isFirst ? 'text-yellow-300' : 'text-white/50'}`}>
                    {group.count}회
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Main ---
type View = 'public' | 'pin' | 'attendance'
type Step = 'search' | 'done'

export default function HomePage() {
  const [view, setView] = useState<View>('public')
  const [activeGame, setActiveGame] = useState<'dino' | 'flappy'>('dino')

  // PIN
  const [pinDigits, setPinDigits] = useState(['', '', '', ''])
  const [pinError, setPinError] = useState(false)
  const pinRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null])

  // Leaderboard (always loaded)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(true)

  // Attendance (loaded on enter)
  const [members, setMembers] = useState<Member[]>([])
  const [checkedInIds, setCheckedInIds] = useState<Set<number>>(new Set())
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [step, setStep] = useState<Step>('search')
  const [doneName, setDoneName] = useState('')
  const [attendanceLoading, setAttendanceLoading] = useState(true)

  useEffect(() => { loadLeaderboard() }, [])

  useEffect(() => {
    if (view === 'attendance') loadAttendanceData()
  }, [view])

  useEffect(() => {
    if (step !== 'done') return
    const t = setTimeout(() => {
      setStep('search')
      setQuery('')
      setDoneName('')
      loadLeaderboard()
    }, 5000)
    return () => clearTimeout(t)
  }, [step])

  async function loadLeaderboard() {
    setLeaderboardLoading(true)
    const now = getKSTNow()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const { data: resetData } = await supabase
      .from('leaderboard_resets').select('reset_at')
      .order('reset_at', { ascending: false }).limit(1).maybeSingle()
    const resetDate = resetData?.reset_at?.slice(0, 10)
    const startDate = resetDate && resetDate > monthStart ? resetDate : monthStart
    const { data: sessionData } = await supabase.from('sessions').select('id').gte('date', startDate)
    const sessionIds = (sessionData ?? []).map((s: { id: number }) => s.id)
    if (sessionIds.length === 0) { setLeaderboard([]); setLeaderboardLoading(false); return }
    const { data } = await supabase
      .from('attendance').select('member_id, members!inner(name)').in('session_id', sessionIds)
    setLeaderboard(computeRanks((data ?? []) as unknown as AttendanceRow[]))
    setLeaderboardLoading(false)
  }

  async function loadAttendanceData() {
    setAttendanceLoading(true)
    const today = getTodayKST()
    const { sessionId: sid, error } = await getOrCreateSession(today)
    if (error || !sid) { setAttendanceLoading(false); return }
    setSessionId(sid)
    const [{ data: membersData }, { data: attendanceData }] = await Promise.all([
      supabase.from('members').select('*').order('name'),
      supabase.from('attendance').select('member_id').eq('session_id', sid),
    ])
    setMembers(membersData ?? [])
    setCheckedInIds(new Set((attendanceData ?? []).map((a: { member_id: number }) => a.member_id)))
    setAttendanceLoading(false)
  }

  async function handleSelect(member: Member) {
    if (!sessionId || checkedInIds.has(member.id)) return
    const { error } = await markAttendance(sessionId, member.id)
    if (error) { console.error(error); return }
    setCheckedInIds(prev => new Set(prev).add(member.id))
    setDoneName(member.name)
    setStep('done')
  }

  function handlePinDigit(idx: number, val: string) {
    if (!/^\d*$/.test(val)) return
    const next = [...pinDigits]
    next[idx] = val.slice(-1)
    setPinDigits(next)
    setPinError(false)
    if (val && idx < 3) pinRefs.current[idx + 1]?.focus()
    if (next.every(d => d !== '')) {
      const code = next.join('')
      if (code === ADMIN_PIN) {
        setView('attendance')
        setPinDigits(['', '', '', ''])
      } else {
        setPinError(true)
        setPinDigits(['', '', '', ''])
        setTimeout(() => pinRefs.current[0]?.focus(), 50)
      }
    }
  }

  function handlePinKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !pinDigits[idx] && idx > 0) {
      pinRefs.current[idx - 1]?.focus()
    }
  }

  const filtered = query.trim() ? members.filter(m => m.name.includes(query.trim())) : []

  // --- 출석 완료 화면 ---
  if (view === 'attendance' && step === 'done') {
    const confettiItems = [
      { color: '#22c55e', tx: '-60px', ty: '-80px', tr: '-30deg' },
      { color: '#3b82f6', tx: '60px',  ty: '-80px', tr: '30deg'  },
      { color: '#f59e0b', tx: '-80px', ty: '-20px', tr: '-60deg' },
      { color: '#ef4444', tx: '80px',  ty: '-20px', tr: '60deg'  },
      { color: '#a855f7', tx: '-40px', ty: '-100px', tr: '20deg' },
      { color: '#ec4899', tx: '40px',  ty: '-100px', tr: '-20deg'},
      { color: '#06b6d4', tx: '-90px', ty: '-50px',  tr: '45deg' },
      { color: '#f97316', tx: '90px',  ty: '-50px',  tr: '-45deg'},
    ]
    return (
      <main className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center overflow-hidden">
        <style>{`
          @keyframes circlePop { 0%{transform:scale(0);opacity:0} 60%{transform:scale(1.15);opacity:1} 80%{transform:scale(0.95)} 100%{transform:scale(1)} }
          @keyframes checkDraw { from{stroke-dashoffset:50} to{stroke-dashoffset:0} }
          @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
          @keyframes confettiFly { 0%{opacity:1;transform:translate(0,0) rotate(0deg) scale(1)} 100%{opacity:0;transform:translate(var(--tx),var(--ty)) rotate(var(--tr)) scale(0.4)} }
        `}</style>
        <div className="relative flex items-center justify-center mb-8">
          {confettiItems.map((c, i) => (
            <div key={i} style={{ position:'absolute', width:10, height:10, borderRadius:3, backgroundColor:c.color, '--tx':c.tx,'--ty':c.ty,'--tr':c.tr, animation:'confettiFly 0.8s cubic-bezier(0.25,0.46,0.45,0.94) 0.2s forwards', opacity:0 } as React.CSSProperties} />
          ))}
          <div style={{ animation:'circlePop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards' }} className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13l4 4L19 7" style={{ strokeDasharray:50, strokeDashoffset:50, animation:'checkDraw 0.4s ease-out 0.35s forwards' }} />
            </svg>
          </div>
        </div>
        <p style={{ opacity:0, animation:'fadeUp 0.4s ease-out 0.55s forwards' }} className="text-2xl font-bold text-gray-900 mb-2">{doneName}님, 출석 완료!</p>
        <p style={{ opacity:0, animation:'fadeUp 0.4s ease-out 0.7s forwards' }} className="text-gray-400 text-base mb-10">오늘도 즐거운 러닝 되세요 🏃</p>
        <button onClick={() => { setStep('search'); setQuery(''); setDoneName('') }}
          style={{ opacity:0, animation:'fadeUp 0.4s ease-out 0.9s forwards' }}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          ← 계속 출석 체크 (5초 후 자동 이동)
        </button>
      </main>
    )
  }

  // --- 출석 체크 화면 (PIN 통과 후) ---
  if (view === 'attendance') {
    return (
      <main className="relative min-h-screen px-6 pt-14 pb-10 overflow-hidden bg-black">
        <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover object-center" src={VIDEO_INTRO} />
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative z-10 max-w-sm mx-auto">
          <button onClick={() => { setView('public'); setQuery(''); setStep('search') }}
            className="flex items-center gap-1 text-white/40 hover:text-white/70 text-sm mb-6 transition-colors">
            ← 홈으로
          </button>
          <img src={LOGO_URL} alt="로고" className="w-10 h-10 object-contain mb-5" />
          <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">출석 체크</h1>
          <p className="text-sm font-medium text-white/70 mb-8">출석한 멤버 이름을 검색하세요.</p>
          <div className="relative mb-3">
            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="이름 검색" autoFocus
              className="w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-5 py-5 text-lg font-bold text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-white/30 transition" />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-sm">✕</button>
            )}
          </div>
          {attendanceLoading ? (
            <p className="text-center text-white/30 text-sm py-10">불러오는 중...</p>
          ) : query.trim() === '' ? (
            <p className="text-center text-white/40 text-sm py-10">이름을 입력하세요.</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-white/70 text-sm py-10">검색 결과가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(member => {
                const done = checkedInIds.has(member.id)
                return (
                  <button key={member.id} onClick={() => handleSelect(member)} disabled={done}
                    className={`w-full text-left rounded-2xl px-5 py-4 text-base font-normal transition-all flex items-center justify-between backdrop-blur-md border ${done ? 'bg-green-400/15 border-green-400/25 text-green-300 cursor-default' : 'bg-white/10 border-white/20 text-white hover:bg-white/15 active:scale-[0.98]'}`}>
                    <span>{member.name}</span>
                    {done && <span className="text-xs font-medium text-green-400">출석 완료 ✓</span>}
                  </button>
                )
              })}
            </div>
          )}
          {ADMIN_NAMES.includes(query.trim()) && (
            <div className="mt-4">
              <a href="/admin" className="flex items-center justify-center w-full rounded-2xl px-5 py-3 text-sm font-medium backdrop-blur-md bg-white/10 border border-white/20 text-white/60 hover:bg-white/15 active:scale-[0.98] transition-all">
                운영진 관리 페이지 →
              </a>
            </div>
          )}
        </div>
      </main>
    )
  }

  // --- 공통 화면 (항상) ---
  return (
    <main className="relative min-h-screen overflow-hidden bg-black">
      <video muted playsInline preload="auto"
        onLoadedData={e => { e.currentTarget.currentTime = GAME_BG_FRAME }}
        className="absolute inset-0 w-full h-full object-cover object-center"
        src={VIDEO_INTRO} />
      <div className="absolute inset-0 bg-black/55" />

      {/* PIN 모달 */}
      {view === 'pin' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
          <div className="w-full max-w-xs bg-white/10 border border-white/20 rounded-3xl p-8 backdrop-blur-xl flex flex-col items-center">
            <img src={LOGO_URL} alt="로고" className="w-12 h-12 object-contain mb-5" />
            <p className="text-white font-semibold text-base mb-1">관리자 접속</p>
            <p className="text-white/40 text-xs mb-6">4자리 코드를 입력하세요</p>
            <div className="flex gap-3 mb-3">
              {pinDigits.map((d, i) => (
                <input
                  key={i}
                  ref={el => { pinRefs.current[i] = el }}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handlePinDigit(i, e.target.value)}
                  onKeyDown={e => handlePinKeyDown(i, e)}
                  className={`w-12 h-14 text-center text-2xl font-bold bg-white/10 border rounded-xl text-white outline-none transition-all ${pinError ? 'border-red-400/60 bg-red-400/10' : 'border-white/20 focus:border-white/50 focus:bg-white/15'}`}
                />
              ))}
            </div>
            {pinError && <p className="text-red-400 text-xs mb-3">코드가 틀렸습니다</p>}
            <button onClick={() => { setView('public'); setPinDigits(['', '', '', '']); setPinError(false) }}
              className="text-white/30 text-xs mt-2 hover:text-white/60 transition-colors">취소</button>
          </div>
        </div>
      )}

      <div className="relative z-10 flex flex-col items-center px-6 pt-16 pb-16">
        {/* 로고 (클릭 → PIN) */}
        <button onClick={() => { setView('pin'); setTimeout(() => pinRefs.current[0]?.focus(), 100) }}
          className="mb-4 active:scale-95 transition-transform">
          <img src={LOGO_URL} alt="로고" className="w-16 h-16 object-contain" />
        </button>
        <p className="text-xl font-bold text-white mb-1">러닝크루 부스터</p>
        <p className="text-sm text-white/40 mb-10">매주 월·수·토 함께 달려요</p>

        {/* 출석 리더보드 */}
        <div className="w-full max-w-sm mb-8">
          <Leaderboard entries={leaderboard} loading={leaderboardLoading} />
        </div>

        {/* 미니게임 */}
        <p className="text-sm text-white/50 mb-4">정기러닝이 없는 날엔 간단한 게임을 해봐요</p>
        <div className="flex gap-2 mb-5 w-full max-w-sm">
          <button
            onClick={() => setActiveGame('dino')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeGame === 'dino' ? 'bg-white/20 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'}`}
          >
            🦕 다이노게임
          </button>
          <button
            onClick={() => setActiveGame('flappy')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeGame === 'flappy' ? 'bg-white/20 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'}`}
          >
            🐦 플래피버드
          </button>
        </div>
        {activeGame === 'dino' ? <DinoGame /> : <FlappyGame />}
      </div>
    </main>
  )
}
