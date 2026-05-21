'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase, Member } from '@/lib/supabase'
import { DinoGame } from '@/components/DinoGame'
import { FlappyGame } from '@/components/FlappyGame'

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

// --- Weather ---
type ForecastItem = { time: string; pty: string; sky: string; t1h: string }

function ptyIcon(pty: string, sky: string): string {
  if (pty === '1') return '🌧'
  if (pty === '2') return '🌨'
  if (pty === '3') return '❄️'
  if (pty === '5') return '🌦'
  if (pty === '6' || pty === '7') return '🌨'
  if (sky === '3') return '🌤'
  if (sky === '4') return '☁️'
  return '☀️'
}

function ptyLabel(pty: string, sky: string): string {
  if (pty === '1') return '비'
  if (pty === '2') return '비/눈'
  if (pty === '3') return '눈'
  if (pty === '5') return '빗방울'
  if (pty === '6' || pty === '7') return '눈날림'
  if (sky === '3') return '구름많음'
  if (sky === '4') return '흐림'
  return '맑음'
}

// Deterministic particles (Math.random 쓰면 hydration mismatch)
const RAIN_P = Array.from({ length: 32 }, (_, i) => ({
  left:  `${(i * 3.13 + 0.7) % 100}%`,
  delay: `${(i * 0.048) % 1.1}s`,
  dur:   `${0.4 + (i * 0.022) % 0.2}s`,
  h:     20 + (i % 5) * 6,
  op:    0.3 + (i % 4) * 0.13,
}))
const SNOW_P = Array.from({ length: 22 }, (_, i) => ({
  left:  `${(i * 4.55 + 1.8) % 100}%`,
  delay: `${(i * 0.19) % 3.5}s`,
  dur:   `${3.5 + (i * 0.28) % 3}s`,
  size:  3.5 + (i % 4) * 1.5,
  dx:    `${-28 + (i * 2.9) % 56}px`,
}))

// iOS-style cloud: 여러 blurred 원 → 뭉실한 구름
function IosCloud({ scale = 1, dark = false, opacity = 1 }: { scale?: number; dark?: boolean; opacity?: number }) {
  const s = (v: number) => Math.round(v * scale)
  const f = dark ? 'rgba(50,68,88,' : 'rgba(255,255,255,'
  return (
    <div style={{ position:'relative', width:s(220), height:s(120), filter:`blur(${s(18)}px)`, opacity }}>
      <div style={{ position:'absolute', bottom:0,     left:0,      width:'100%', height:s(48), background:`${f}.28)`, borderRadius:s(24) }} />
      <div style={{ position:'absolute', bottom:s(26), left:s(8),   width:s(70),  height:s(66), background:`${f}.26)`, borderRadius:'50%' }} />
      <div style={{ position:'absolute', bottom:s(36), left:s(48),  width:s(96),  height:s(88), background:`${f}.30)`, borderRadius:'50%' }} />
      <div style={{ position:'absolute', bottom:s(22), left:s(114), width:s(74),  height:s(62), background:`${f}.26)`, borderRadius:'50%' }} />
    </div>
  )
}

function WeatherAnimation({ pty, sky }: { pty: string; sky: string }) {
  const rain    = pty === '1' || pty === '5' || pty === '2' || pty === '6'
  const snow    = pty === '3' || pty === '7'
  const clear   = pty === '0' && sky === '1'
  const partly  = pty === '0' && sky === '3'
  const overcast = !rain && !snow && !clear && !partly

  return (
    <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
      <style>{`
        @keyframes wxRain { from{transform:translateY(-40px)} to{transform:translateY(112vh)} }
        @keyframes wxSnow { from{transform:translateY(-20px) translateX(0)} to{transform:translateY(112vh) translateX(var(--dx))} }
        @keyframes wxGlow { 0%,100%{opacity:.72;transform:scale(1)} 50%{opacity:1;transform:scale(1.12)} }
        @keyframes wxRayR { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes wxCldA { 0%,100%{transform:translateX(0)} 50%{transform:translateX(22px)} }
        @keyframes wxCldB { 0%,100%{transform:translateX(0)} 50%{transform:translateX(-16px)} }
        @keyframes wxCldC { 0%,100%{transform:translateX(0)} 50%{transform:translateX(11px)} }
      `}</style>

      {/* ☀️ 맑음 — 화면 상단 중앙, 큰 글로우 + 회전 광선 */}
      {clear && (
        <div style={{ position:'absolute', top:'2%', left:'50%', transform:'translateX(-50%)' }}>
          <div style={{ position:'relative', width:100, height:100 }}>
            <div style={{ position:'absolute', inset:-100, background:'radial-gradient(circle,rgba(255,195,40,.30) 0%,rgba(255,170,20,.08) 45%,transparent 65%)', animation:'wxGlow 5s ease-in-out infinite' }} />
            <div style={{ position:'absolute', inset:-40,  background:'radial-gradient(circle,rgba(255,215,70,.22) 0%,transparent 60%)', animation:'wxGlow 3.5s ease-in-out infinite' }} />
            <div style={{ position:'absolute', inset:0, animation:'wxRayR 32s linear infinite' }}>
              {Array.from({length:8}, (_,i) => (
                <div key={i} style={{ position:'absolute', top:'50%', left:'50%', width:2, height:32, background:'rgba(255,215,60,.55)', borderRadius:2, transformOrigin:'50% 0', transform:`rotate(${i*45}deg) translateX(-50%) translateY(-66px)` }} />
              ))}
            </div>
            <div style={{ position:'absolute', inset:14, background:'radial-gradient(circle at 38% 32%,#FFF4A0,#FFC500)', borderRadius:'50%', boxShadow:'0 0 55px 18px rgba(255,195,30,.50)', animation:'wxGlow 5s ease-in-out infinite' }} />
          </div>
        </div>
      )}

      {/* 🌤 구름많음 — 작은 태양(왼쪽) + 큰 구름이 가림 */}
      {partly && (
        <>
          <div style={{ position:'absolute', top:'4%', left:'14%' }}>
            <div style={{ position:'relative', width:62, height:62 }}>
              <div style={{ position:'absolute', inset:-24, background:'radial-gradient(circle,rgba(255,200,50,.26) 0%,transparent 60%)' }} />
              <div style={{ position:'absolute', inset:0, animation:'wxRayR 26s linear infinite' }}>
                {Array.from({length:6}, (_,i) => (
                  <div key={i} style={{ position:'absolute', top:'50%', left:'50%', width:1.5, height:19, background:'rgba(255,215,60,.52)', borderRadius:1, transformOrigin:'50% 0', transform:`rotate(${i*60}deg) translateX(-50%) translateY(-38px)` }} />
                ))}
              </div>
              <div style={{ position:'absolute', inset:10, background:'radial-gradient(circle at 38% 32%,#FFF4A0,#FFC500)', borderRadius:'50%', boxShadow:'0 0 28px 8px rgba(255,195,30,.40)' }} />
            </div>
          </div>
          <div style={{ position:'absolute', top:44, left:'50%', transform:'translateX(-55%)', animation:'wxCldA 10s ease-in-out infinite' }}>
            <IosCloud scale={1.3} />
          </div>
        </>
      )}

      {/* ☁️ 흐림 — 3개 구름 레이어 */}
      {overcast && (
        <>
          <div style={{ position:'absolute', top:8,  left:'50%', transform:'translateX(-52%)', animation:'wxCldA 11s ease-in-out infinite' }}>
            <IosCloud scale={1.5} />
          </div>
          <div style={{ position:'absolute', top:95, left:'50%', transform:'translateX(-25%)', animation:'wxCldB 14s ease-in-out infinite' }}>
            <IosCloud scale={1.0} opacity={0.6} />
          </div>
          <div style={{ position:'absolute', top:55, left:'50%', transform:'translateX(-90%)', animation:'wxCldC 9s ease-in-out infinite' }}>
            <IosCloud scale={0.8} opacity={0.45} />
          </div>
        </>
      )}

      {/* 🌧 비 — 어두운 구름 + 사선 빗줄기 */}
      {rain && (
        <>
          <div style={{ position:'absolute', top:-15, left:'50%', transform:'translateX(-52%)', animation:'wxCldA 11s ease-in-out infinite' }}>
            <IosCloud scale={1.8} dark />
          </div>
          <div style={{ position:'absolute', inset:-150, transform:'rotate(10deg)' }}>
            {RAIN_P.map((p, i) => (
              <div key={i} style={{ position:'absolute', left:p.left, top:0, width:1.5, height:p.h, background:`rgba(180,220,255,${p.op})`, borderRadius:2, animation:`wxRain ${p.dur} ${p.delay} linear infinite`, willChange:'transform' }} />
            ))}
          </div>
        </>
      )}

      {/* ❄️ 눈 */}
      {snow && (
        <>
          <div style={{ position:'absolute', top:0, left:'50%', transform:'translateX(-52%)', animation:'wxCldB 12s ease-in-out infinite', opacity:.65 }}>
            <IosCloud scale={1.4} />
          </div>
          {SNOW_P.map((p, i) => (
            <div key={i} style={{ position:'absolute', left:p.left, top:0, width:p.size, height:p.size, background:'rgba(255,255,255,.88)', borderRadius:'50%', '--dx':p.dx, animation:`wxSnow ${p.dur} ${p.delay} ease-in-out infinite`, willChange:'transform' } as React.CSSProperties} />
          ))}
        </>
      )}
    </div>
  )
}

// 날씨누리 공식 지도 iframe embed
const WEATHER_MAP_URL =
  'https://www.weather.go.kr/wgis-nuri/html/map.html?location=127.085934987551,37.1993699999133'

function WeatherMap() {
  return (
    <div style={{
      width: '100%', height: 220,
      borderRadius: 18, overflow: 'hidden',
      background: 'rgba(0,0,0,.3)',
    }}>
      <iframe
        src={WEATHER_MAP_URL}
        title="동탄 여울공원 날씨 지도"
        style={{ width: '100%', height: '100%', border: 'none' }}
        scrolling="no"
      />
    </div>
  )
}

function getWeatherBg(forecasts: ForecastItem[] | null): string {
  const h = getKSTNow().getHours()
  const pty = forecasts?.[0]?.pty ?? '0'
  const sky = forecasts?.[0]?.sky ?? '1'
  const isNight = h >= 20 || h < 6
  const isDusk  = h >= 17 && h < 20
  const isDawn  = h >= 5  && h < 7

  if (pty === '3' || pty === '7')
    return isNight ? 'linear-gradient(180deg,#1e2d3d 0%,#2a3d52 100%)' : 'linear-gradient(180deg,#a0bdd2 0%,#7098b4 100%)'
  if (pty !== '0')
    return isNight ? 'linear-gradient(180deg,#10182a 0%,#1a2638 100%)' : 'linear-gradient(180deg,#36505e 0%,#243848 100%)'
  if (sky === '4')
    return isNight ? 'linear-gradient(180deg,#18202e 0%,#242e3c 100%)' : 'linear-gradient(180deg,#606e7c 0%,#48565e 100%)'
  if (sky === '3')
    return isNight ? 'linear-gradient(180deg,#162040 0%,#203052 100%)' : 'linear-gradient(180deg,#4278a0 0%,#306080 100%)'
  if (isNight) return 'linear-gradient(180deg,#080e20 0%,#0c1a34 50%,#101e3c 100%)'
  if (isDusk)  return 'linear-gradient(180deg,#d84f1a 0%,#8a2888 45%,#1a2a60 100%)'
  if (isDawn)  return 'linear-gradient(180deg,#d4724a 0%,#a83882 50%,#3448a0 100%)'
  return 'linear-gradient(180deg,#1e8edc 0%,#1468c4 45%,#0c4aaa 100%)'
}

function WeatherPage({ forecasts }: { forecasts: ForecastItem[] | null }) {
  const now = getKSTNow()
  const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
  const current = forecasts?.[0]
  const temps = (forecasts ?? []).map(f => parseInt(f.t1h)).filter(n => !isNaN(n))
  const maxTemp = temps.length ? Math.max(...temps) : null
  const minTemp = temps.length ? Math.min(...temps) : null

  return (
    <div style={{
      position: 'relative', height: '100dvh',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      color: 'white', overflow: 'hidden',
      fontFamily: '-apple-system,"SF Pro Display",system-ui,sans-serif',
    }}>
      {current && <WeatherAnimation pty={current.pty} sky={current.sky} />}

      {/* 도시명 */}
      <div style={{ marginTop:'clamp(52px,15dvh,100px)', textAlign:'center', position:'relative', zIndex:1 }}>
        <p style={{ fontSize:28, fontWeight:300, margin:0, letterSpacing:0.3 }}>동탄 여울공원</p>
        <p style={{ fontSize:14, margin:'4px 0 0', opacity:.55 }}>화성시 · {timeStr} 기준</p>
      </div>

      {/* 온도 — 극세, 아주 크게 */}
      <div style={{ position:'relative', zIndex:1, lineHeight:0.9, marginTop:2 }}>
        <p style={{ fontSize:'clamp(96px,26vw,130px)', fontWeight:100, margin:0, letterSpacing:-4 }}>
          {current ? `${current.t1h}°` : '--°'}
        </p>
      </div>

      {/* 날씨 조건 + 최고·최저 */}
      <div style={{ position:'relative', zIndex:1, textAlign:'center', marginTop:6 }}>
        <p style={{ fontSize:20, margin:0, fontWeight:400, opacity:.88 }}>
          {current ? ptyLabel(current.pty, current.sky) : ''}
        </p>
        {maxTemp !== null && minTemp !== null && (
          <p style={{ fontSize:16, margin:'5px 0 0', opacity:.58, fontWeight:400 }}>
            최고 {maxTemp}°  ·  최저 {minTemp}°
          </p>
        )}
      </div>

      {/* 지도 */}
      {current && (
        <div style={{ position:'relative', zIndex:1, width:'100%', padding:'0 16px', marginTop: 24, marginBottom: 8 }}>
          <WeatherMap />
        </div>
      )}

      <div style={{ flex:1 }} />

      {/* 시간별 예보 — 하단 고정 유리 카드 */}
      <div style={{ width:'100%', padding:'0 16px', paddingBottom:'max(80px, calc(env(safe-area-inset-bottom) + 64px))', position:'relative', zIndex:1 }}>
        <div style={{
          background:'rgba(255,255,255,0.13)',
          backdropFilter:'blur(40px)', WebkitBackdropFilter:'blur(40px)',
          borderRadius:22, border:'0.5px solid rgba(255,255,255,0.22)',
          padding:'14px 20px 18px',
        }}>
          <p style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:1.6, opacity:.52, margin:'0 0 14px' }}>
            시간별 예보
          </p>
          {forecasts && forecasts.length > 0 ? (
            <div style={{ display:'flex', gap:0, overflowX:'auto', paddingBottom:2, scrollbarWidth:'none', justifyContent:'space-evenly' }}>
              {forecasts.map((f, i) => (
                <div key={f.time} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:7, flexShrink:0 }}>
                  <span style={{ fontSize:13, opacity:.65, fontWeight:400 }}>{i === 0 ? '지금' : `${f.time.slice(0,2)}시`}</span>
                  <span style={{ fontSize:24 }}>{ptyIcon(f.pty, f.sky)}</span>
                  <span style={{ fontSize:16, fontWeight:500 }}>{f.t1h}°</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize:13, opacity:.45, margin:0 }}>불러오는 중...</p>
          )}
        </div>
      </div>
    </div>
  )
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
  const [view, setView]           = useState<View>('public')
  const [activeGame, setActiveGame] = useState<'dino' | 'flappy'>('dino')
  const [pageIndex, setPageIndex] = useState(0)
  const [gameOpen, setGameOpen]   = useState(false)
  const [forecasts, setForecasts] = useState<ForecastItem[] | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // PIN
  const [pinDigits, setPinDigits] = useState(['', '', '', ''])
  const [pinError, setPinError]   = useState(false)
  const pinRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null])

  // Leaderboard
  const [leaderboard, setLeaderboard]           = useState<LeaderboardEntry[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(true)

  // Attendance
  const [members, setMembers]               = useState<Member[]>([])
  const [checkedInIds, setCheckedInIds]     = useState<Set<number>>(new Set())
  const [sessionId, setSessionId]           = useState<number | null>(null)
  const [query, setQuery]                   = useState('')
  const [step, setStep]                     = useState<Step>('search')
  const [doneName, setDoneName]             = useState('')
  const [attendanceLoading, setAttendanceLoading] = useState(true)

  useEffect(() => { loadLeaderboard() }, [])

  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    const idx = Math.round(el.scrollLeft / el.clientWidth)
    if (idx !== pageIndex) setPageIndex(idx)
  }

  function scrollToPage(idx: number) {
    containerRef.current?.scrollTo({ left: idx * (containerRef.current.clientWidth), behavior: 'smooth' })
    setPageIndex(idx)
  }

  useEffect(() => {
    fetch('/api/weather')
      .then(r => r.json())
      .then(d => setForecasts(d.forecasts ?? null))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (view === 'attendance') loadAttendanceData()
  }, [view])

  useEffect(() => {
    if (step !== 'done') return
    const t = setTimeout(() => {
      setStep('search'); setQuery(''); setDoneName('')
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
    setAttendanceLoading(false)
  }

  async function handleSelect(member: Member) {
    if (!sessionId || checkedInIds.has(member.id)) return
    await supabase.from('attendance').insert({ session_id: sessionId, member_id: member.id })
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
        setView('attendance'); setPinDigits(['', '', '', ''])
      } else {
        setPinError(true); setPinDigits(['', '', '', ''])
        setTimeout(() => pinRefs.current[0]?.focus(), 50)
      }
    }
  }

  function handlePinKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !pinDigits[idx] && idx > 0) pinRefs.current[idx - 1]?.focus()
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

  // --- 공통 화면 ---
  return (
    <main className="relative bg-black" style={{ height: '100dvh', overflow: 'hidden' }}>

      {/* 배경 1: 메인 페이지 (비디오) */}
      <video
        muted playsInline preload="auto"
        onLoadedData={e => { e.currentTarget.currentTime = GAME_BG_FRAME }}
        className="absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-500"
        style={{ opacity: pageIndex === 0 ? 1 : 0 }}
        src={VIDEO_INTRO}
      />
      <div
        className="absolute inset-0 bg-black/55 transition-opacity duration-500"
        style={{ opacity: pageIndex === 0 ? 1 : 0 }}
      />

      {/* 배경 2: 날씨 페이지 (그라디언트) */}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{ opacity: pageIndex === 1 ? 1 : 0, background: getWeatherBg(forecasts) }}
      />

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
                  type="password" inputMode="numeric" maxLength={1} value={d}
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

      {/* 스와이프 컨테이너 — CSS scroll-snap */}
      <style>{`.snap-x::-webkit-scrollbar{display:none}`}</style>
      <div
        ref={containerRef}
        className="snap-x relative z-10 flex"
        style={{
          width: '100vw', height: '100dvh',
          overflowX: 'scroll', overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
        }}
        onScroll={handleScroll}
      >
        {/* Panel 1: 메인 */}
        <div
          className="flex-none overflow-y-auto overflow-x-hidden flex flex-col items-center px-6 pt-16 pb-28"
          style={{ width: '100vw', height: '100dvh', scrollSnapAlign: 'start' }}
        >
          {/* 로고 → PIN */}
          <button
            onClick={() => { setView('pin'); setTimeout(() => pinRefs.current[0]?.focus(), 100) }}
            className="mb-4 active:scale-95 transition-transform"
          >
            <img src={LOGO_URL} alt="로고" className="w-16 h-16 object-contain" />
          </button>
          <p className="text-xl font-bold text-white mb-1">러닝크루 부스터</p>
          <p className="text-sm text-white/40 mb-8">매주 월·수·토 함께 달려요</p>

          {/* 리더보드 */}
          <div className="w-full max-w-sm mb-6">
            <Leaderboard entries={leaderboard} loading={leaderboardLoading} />
          </div>

          {/* 미니게임 (접기/펼치기) */}
          <div className="w-full max-w-sm">
            <button
              onClick={() => setGameOpen(o => !o)}
              className="w-full flex items-center justify-between px-1 mb-3 group"
            >
              <p className="text-xs font-semibold text-white/40 uppercase tracking-widest group-hover:text-white/60 transition-colors">
                미니게임
              </p>
              <span className={`text-white/30 group-hover:text-white/50 transition-all duration-300 ${gameOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>
            <div className={`overflow-hidden transition-all duration-300 ${gameOpen ? 'max-h-[2400px] opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="flex gap-2 mb-5">
                <button onClick={() => setActiveGame('dino')} style={{ touchAction: 'manipulation' }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeGame === 'dino' ? 'bg-white/20 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'}`}>
                  🦕 다이노게임
                </button>
                <button onClick={() => setActiveGame('flappy')} style={{ touchAction: 'manipulation' }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeGame === 'flappy' ? 'bg-white/20 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'}`}>
                  🐦 플래피버드
                </button>
              </div>
              {activeGame === 'dino' ? <DinoGame /> : <FlappyGame />}
            </div>
          </div>
        </div>

        {/* Panel 2: 날씨 */}
        <div
          className="flex-none overflow-y-auto overflow-x-hidden"
          style={{ width: '100vw', height: '100dvh', scrollSnapAlign: 'start' }}
        >
          <WeatherPage forecasts={forecasts} />
        </div>
      </div>

      {/* 페이지 인디케이터 (탭 가능) */}
      <div className="fixed bottom-8 left-0 right-0 flex justify-center gap-3 z-20">
        {[0, 1].map(idx => (
          <button
            key={idx}
            onClick={() => scrollToPage(idx)}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${pageIndex === idx ? 'bg-white scale-125' : 'bg-white/35'}`}
          />
        ))}
      </div>
    </main>
  )
}
