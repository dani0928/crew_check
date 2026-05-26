'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase, Member } from '@/lib/supabase'
import { DinoGame } from '@/components/DinoGame'
import { FlappyGame } from '@/components/FlappyGame'
import { WeatherCanvas } from '@/components/WeatherCanvas'
import { validatePin } from '@/app/actions/authActions'

const LOGO_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/Booster.jpg`
const VIDEO_INTRO = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/BOOSTER_INTRO.webm`
const GAME_BG_FRAME = 1
// ADMIN_PIN은 서버 액션(authActions.ts)에서 process.env.ADMIN_PIN으로 검증
const ADMIN_NAMES = ['권경민', '박진혁', '백인경', '이종남', '최석진', '하이안', '황진석']

// UTC+9 고정 오프셋 — 서버(UTC)·클라이언트 모두 동일하게 동작
function getKSTNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
}

function getTodayKST(): string {
  const now = getKSTNow()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// --- Weather ---
type ForecastItem = { time: string; pty: string; sky: string; t1h: string; lgt: string }

// --- Air Quality ---
type AirData = {
  pm25: string; pm25Grade: string; pm25Label: string
  pm10: string; pm10Grade: string; pm10Label: string
  dataTime: string; station: string
} | null

function airGradeInfo(grade: string): { color: string; pulseClass: string } {
  if (grade === '1') return { color: '#5ACC8C', pulseClass: 'air-pulse-slow' }
  if (grade === '2') return { color: '#FAD148', pulseClass: 'air-pulse-slow' }
  if (grade === '3') return { color: '#FF8C42', pulseClass: 'air-pulse-mid'  }
  if (grade === '4') return { color: '#FF4444', pulseClass: 'air-pulse-fast' }
  return { color: 'rgba(255,255,255,0.35)', pulseClass: '' }
}

function AirGauge({
  name, value, grade, label, maxVal,
}: { name: string; value: string; grade: string; label: string; maxVal: number }) {
  const { color, pulseClass } = airGradeInfo(grade)
  const r     = 33
  const circ  = 2 * Math.PI * r
  const num   = parseFloat(value)
  const pct   = isNaN(num) ? 0 : Math.min(num / maxVal, 1)
  const offset = circ * (1 - pct)

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
      <div style={{ position:'relative', width:82, height:82 }}>
        {/* pulse ring */}
        {pulseClass && (
          <div className={`air-pulse-ring ${pulseClass}`} style={{ color }} />
        )}
        {/* SVG ring */}
        <svg width="82" height="82" viewBox="0 0 82 82" style={{ transform:'rotate(-90deg)' }}>
          <circle cx="41" cy="41" r={r} fill="none"
            stroke="rgba(255,255,255,0.09)" strokeWidth="5" />
          <circle cx="41" cy="41" r={r} fill="none"
            stroke={color} strokeWidth="5"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition:'stroke-dashoffset 1.2s ease' }}
          />
        </svg>
        {/* 중앙 수치 */}
        <div style={{
          position:'absolute', inset:0,
          display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center',
        }}>
          <span style={{ fontSize:17, fontWeight:600, color:'rgba(255,255,255,0.92)', lineHeight:1 }}>
            {isNaN(num) ? '-' : value}
          </span>
          <span style={{ fontSize:8, color:'rgba(255,255,255,0.38)', marginTop:2 }}>µg/m³</span>
        </div>
      </div>
      <div style={{ textAlign:'center' }}>
        <p style={{ fontSize:10, fontWeight:600, letterSpacing:1.2, textTransform:'uppercase', color:'rgba(255,255,255,0.48)', margin:0 }}>
          {name}
        </p>
        <p style={{ fontSize:13, fontWeight:600, color, margin:'3px 0 0' }}>{label}</p>
      </div>
    </div>
  )
}

function AirSection({ airData }: { airData: AirData }) {
  if (!airData) return null
  return (
    <div style={{ width:'100%', padding:'12px 16px 0', position:'relative', zIndex:1 }}>
      <div style={{
        background:'rgba(255,255,255,0.10)',
        backdropFilter:'blur(40px)', WebkitBackdropFilter:'blur(40px)',
        borderRadius:22, border:'0.5px solid rgba(255,255,255,0.18)',
        padding:'11px 20px 14px',
      }}>
        <p style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:1.5, opacity:.52, margin:'0 0 14px' }}>
          대기질
        </p>
        <div style={{ display:'flex', justifyContent:'space-evenly' }}>
          <AirGauge name="초미세먼지" value={airData.pm25} grade={airData.pm25Grade} label={airData.pm25Label} maxVal={75} />
          <AirGauge name="미세먼지"  value={airData.pm10} grade={airData.pm10Grade} label={airData.pm10Label} maxVal={150} />
        </div>
        <p style={{ fontSize:10, color:'rgba(255,255,255,0.28)', textAlign:'right', margin:'10px 0 0' }}>
          에어코리아 · {airData.station} 측정소
        </p>
      </div>
    </div>
  )
}

function AirBadge({ airData }: { airData: AirData }) {
  if (!airData || airData.pm25 === '-') return null
  const { color } = airGradeInfo(airData.pm25Grade)
  return (
    <div className="flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full px-3 py-1 text-white">
      <span style={{
        width:8, height:8, borderRadius:'50%',
        backgroundColor: color,
        boxShadow: `0 0 6px ${color}`,
        display:'inline-block', flexShrink:0,
      }} />
      <span style={{ fontSize:12, opacity:.75 }}>
        초미세먼지 {airData.pm25Label}
      </span>
    </div>
  )
}

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


// 날씨누리 공식 지도 iframe embed
const WEATHER_MAP_URL =
  'https://www.weather.go.kr/wgis-nuri/html/map.html?location=127.085934987551,37.1993699999133'


function getWeatherBg(forecasts: ForecastItem[] | null): string {
  const h = getKSTNow().getUTCHours()
  const pty = forecasts?.[0]?.pty ?? '0'
  const sky = forecasts?.[0]?.sky ?? '1'
  const lgt = forecasts?.[0]?.lgt ?? '0'
  const isNight = h >= 20 || h < 6
  const isDusk  = h >= 17 && h < 20
  const isDawn  = h >= 5  && h < 7

  if (lgt === '1')
    return 'linear-gradient(180deg,#080c18 0%,#0e1624 100%)'
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

function WeatherPage({ forecasts, airData }: { forecasts: ForecastItem[] | null; airData: AirData }) {
  // "지금" 슬롯의 fcstTime(예: "1400")을 "14:00 기준"으로 표시
  // getKSTNow().getHours()는 KST 브라우저에서 +9가 중복 적용되어 틀림
  const current = forecasts?.[0]
  const timeStr = current?.time
    ? `${current.time.slice(0, 2)}:${current.time.slice(2, 4)}`
    : null
  const temps = (forecasts ?? []).map(f => parseInt(f.t1h)).filter(n => !isNaN(n))
  const maxTemp = temps.length ? Math.max(...temps) : null
  const minTemp = temps.length ? Math.min(...temps) : null

  /*
   * ── 타이포그래피 규정 ─────────────────────────────────────────
   * 폰트: Pretendard, -apple-system, BlinkMacSystemFont, sans-serif
   *
   * Display  clamp(72,19vw,90px)  100  메인 수치 (기온)
   * H1       30px  700  페이지 제목 (출석 체크)
   * H2       22px  600  앱 이름, 도시명
   * H3       20px  600  섹션 제목, 탭 레이블
   * Body L   18px  500  입력창 텍스트
   * Body     16px  400  일반 콘텐츠 (이름, 날씨 조건)
   * Body S   14px  400  보조 텍스트, 기온 수치
   * Caption  12px  400  타임스탬프, 부제
   * Label    11px  600  섹션 라벨 (UPPERCASE + tracking 1.5)
   *
   * 강조 원칙
   *  - 수치/핵심 정보 → 크기로 강조
   *  - 계층 표현 → opacity (primary 1.0 / secondary 0.65 / muted 0.45)
   *  - 섹션 구분 → Label (11px 600 UPPERCASE letterSpacing 1.5)
   *  - 상호작용 요소 → weight 500+
   * ────────────────────────────────────────────────────────────
   */
  return (
    /* 외부: 100dvh 뷰포트 고정, 캔버스 배경만 담음 */
    <div style={{
      position:'relative', height:'100dvh', overflow:'hidden',
      color:'white',
      fontFamily:'Pretendard,-apple-system,BlinkMacSystemFont,sans-serif',
    }}>
      {/* 배경 캔버스 — 스크롤 없이 고정 */}
      {current && <WeatherCanvas pty={current.pty} sky={current.sky} lgt={current.lgt} />}

      {/* 내부: 스크롤 가능한 콘텐츠 영역 */}
      <div style={{
        position:'relative', zIndex:1,
        height:'100%', overflowY:'auto', scrollbarWidth:'none',
        display:'flex', flexDirection:'column', alignItems:'center',
      }}>

        {/* H2 — 도시명 */}
        <div style={{ marginTop:24, textAlign:'center', flexShrink:0 }}>
          <p style={{ fontSize:22, fontWeight:600, margin:0, letterSpacing:0.2 }}>동탄 여울공원</p>
          <p style={{ fontSize:12, fontWeight:400, margin:'3px 0 0', opacity:.55 }}>
            화성시{timeStr ? ` · ${timeStr} 기준` : ''}
          </p>
        </div>

        {/* Display — 기온 */}
        <div style={{ lineHeight:0.9, marginTop:4, flexShrink:0 }}>
          <p style={{ fontSize:'clamp(72px,19vw,90px)', fontWeight:100, margin:0, letterSpacing:-3 }}>
            {current ? `${current.t1h}°` : '--°'}
          </p>
        </div>

        {/* Body — 날씨 조건 + Body S — 최고·최저 */}
        <div style={{ textAlign:'center', marginTop:5, flexShrink:0 }}>
          <p style={{ fontSize:16, margin:0, fontWeight:400, opacity:.88 }}>
            {current ? ptyLabel(current.pty, current.sky) : ''}
          </p>
          {maxTemp !== null && minTemp !== null && (
            <p style={{ fontSize:14, margin:'3px 0 0', opacity:.60, fontWeight:400 }}>
              최고 {maxTemp}°  ·  최저 {minTemp}°
            </p>
          )}
        </div>

        {/* 시간별 예보 카드 */}
        <div style={{ width:'100%', padding:'0 16px', marginTop:14, flexShrink:0 }}>
          <div style={{
            background:'rgba(255,255,255,0.13)',
            backdropFilter:'blur(40px)', WebkitBackdropFilter:'blur(40px)',
            borderRadius:22, border:'0.5px solid rgba(255,255,255,0.22)',
            padding:'11px 20px 13px',
          }}>
            <p style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:1.5, opacity:.52, margin:'0 0 10px' }}>
              시간별 예보
            </p>
            {forecasts && forecasts.length > 0 ? (
              <div style={{ display:'flex', overflowX:'auto', scrollbarWidth:'none', justifyContent:'space-evenly' }}>
                {forecasts.map((f, i) => (
                  <div key={f.time} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, flexShrink:0 }}>
                    <span style={{ fontSize:12, opacity:.65, fontWeight:400 }}>{i === 0 ? '지금' : `${f.time.slice(0,2)}시`}</span>
                    <span style={{ fontSize:20 }}>{ptyIcon(f.pty, f.sky)}</span>
                    <span style={{ fontSize:14, fontWeight:500 }}>{f.t1h}°</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize:13, opacity:.45, margin:0 }}>불러오는 중...</p>
            )}
          </div>
        </div>

        {/* 대기질 카드 */}
        <AirSection airData={airData} />

        {/* 지도 — 고정 높이 (스크롤 컨테이너 안이므로 flex:1 대신 고정값) */}
        <div style={{
          width:'100%', flexShrink:0,
          padding:'12px 16px',
          paddingBottom:'max(36px, calc(env(safe-area-inset-bottom) + 20px))',
        }}>
          <div style={{ height:240, borderRadius:18, overflow:'hidden', background:'rgba(0,0,0,.3)' }}>
            <iframe
              src={WEATHER_MAP_URL}
              title="동탄 여울공원 날씨 지도"
              style={{ width:'100%', height:'100%', border:'none', overflow:'hidden' }}
            />
          </div>
        </div>

      </div>
    </div>
  )
}

// --- Calendar ---
type CalEvent = { id: number; event_date: string; title: string }
type KSTDateParts = { year: number; month: number; day: number }

// 법정 공휴일 (연도별 하드코딩 — 변경 없는 데이터)
const KR_HOLIDAYS: Record<string, string> = {
  '2026-01-01':'신정',
  '2026-01-28':'설날연휴','2026-01-29':'설날','2026-01-30':'설날연휴',
  '2026-03-01':'삼일절',
  '2026-05-05':'어린이날',
  '2026-05-24':'부처님오신날',
  '2026-06-06':'현충일',
  '2026-08-15':'광복절',
  '2026-09-24':'추석연휴','2026-09-25':'추석','2026-09-26':'추석연휴',
  '2026-10-03':'개천절','2026-10-09':'한글날',
  '2026-12-25':'크리스마스',
}

const DAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토']

function daysInMonth(y: number, m: number) {
  // m: 1-indexed
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
function pad2(n: number) { return String(n).padStart(2, '0') }

function getKSTDateParts(): KSTDateParts {
  const kst = getKSTNow()
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
  }
}

function CalendarPage() {
  const initialToday = getKSTDateParts()
  const [today, setToday]   = useState<KSTDateParts | null>(null)
  const [year,   setYear]   = useState(initialToday.year)
  const [month,  setMonth]  = useState(initialToday.month) // 1-indexed
  const [events, setEvents] = useState<CalEvent[]>([])

  const todayY = today?.year
  const todayM = today?.month
  const todayD = today?.day

  useEffect(() => {
    const updateToday = (syncVisibleMonth = false) => {
      const parts = getKSTDateParts()
      setToday(parts)
      if (syncVisibleMonth) {
        setYear(parts.year)
        setMonth(parts.month)
      }
    }
    const initial = setTimeout(() => updateToday(true), 0)
    const t = setInterval(() => updateToday(), 60 * 1000)
    return () => {
      clearTimeout(initial)
      clearInterval(t)
    }
  }, [])

  useEffect(() => {
    const start = `${year}-${pad2(month)}-01`
    const end   = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`
    supabase
      .from('calendar_events')
      .select('id, event_date, title')
      .gte('event_date', start)
      .lte('event_date', end)
      .order('event_date')
      .then(({ data }) => setEvents(data ?? []))
  }, [year, month])

  function prevMonth() { month === 1 ? (setYear(y=>y-1), setMonth(12)) : setMonth(m=>m-1) }
  function nextMonth() { month === 12 ? (setYear(y=>y+1), setMonth(1))  : setMonth(m=>m+1) }

  // day → title
  const eventMap: Record<number, string> = {}
  events.forEach(e => { eventMap[parseInt(e.event_date.split('-')[2])] = e.title })

  // day → holiday name
  const holidayMap: Record<number, string> = {}
  for (let d = 1; d <= daysInMonth(year, month); d++) {
    const key = `${year}-${pad2(month)}-${pad2(d)}`
    if (KR_HOLIDAYS[key]) holidayMap[d] = KR_HOLIDAYS[key]
  }

  // 그리드 셀 (앞 빈칸 + 날짜 + 뒷 빈칸)
  const startDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const totalDays = daysInMonth(year, month)
  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div style={{
      height:'100dvh', overflowY:'auto', scrollbarWidth:'none',
      background:'linear-gradient(180deg,#0a1628 0%,#0f1e3a 55%,#0a1628 100%)',
      color:'white',
      fontFamily:'Pretendard,-apple-system,BlinkMacSystemFont,sans-serif',
    }}>
      {/* 헤더 — 월 이동 */}
      <div style={{ padding:'52px 20px 20px', display:'flex', alignItems:'center', justifyContent:'center', gap:18 }}>
        <button onClick={prevMonth} style={{
          background:'rgba(255,255,255,0.10)', border:'none', borderRadius:'50%',
          width:34, height:34, color:'white', fontSize:20, cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>‹</button>
        <p style={{ fontSize:24, fontWeight:700, margin:0, letterSpacing:-.5, minWidth:120, textAlign:'center' }}>
          {year}년 {month}월
        </p>
        <button onClick={nextMonth} style={{
          background:'rgba(255,255,255,0.10)', border:'none', borderRadius:'50%',
          width:34, height:34, color:'white', fontSize:20, cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>›</button>
      </div>

      {/* 글래스 카드 */}
      <div style={{
        margin:'0 14px',
        background:'rgba(255,255,255,0.07)',
        backdropFilter:'blur(24px)', WebkitBackdropFilter:'blur(24px)',
        borderRadius:24, border:'0.5px solid rgba(255,255,255,0.13)',
        overflow:'hidden',
      }}>
        {/* 요일 헤더 */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
          {DAY_HEADERS.map((h, i) => (
            <div key={h} style={{
              textAlign:'center', padding:'12px 0 10px',
              fontSize:11, fontWeight:600, letterSpacing:.3,
              color: i===0 ? '#FF6B6B' : i===6 ? '#60B8FF' : 'rgba(255,255,255,0.42)',
            }}>{h}</div>
          ))}
        </div>
        <div style={{ height:'0.5px', background:'rgba(255,255,255,0.09)' }} />

        {/* 날짜 셀 */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
          {cells.map((day, idx) => {
            const row = Math.floor(idx / 7)
            const dow = idx % 7
            const borderStyle = {
              borderTop:   row > 0  ? '0.5px solid rgba(255,255,255,0.08)' : 'none',
              borderRight: dow < 6  ? '0.5px solid rgba(255,255,255,0.08)' : 'none',
            }
            if (day === null) return <div key={`e${idx}`} style={{ minHeight:78, ...borderStyle }} />

            const isSun   = dow === 0
            const isSatC  = dow === 6
            const isHol   = !!holidayMap[day]
            const isToday = today !== null && year===todayY && month===todayM && day===todayD
            const event   = eventMap[day]
            const holiday = holidayMap[day]
            const dateCol = (isSun || isHol) ? '#FF6B6B' : isSatC ? '#60B8FF' : 'rgba(255,255,255,0.88)'

            return (
              <div key={`${year}-${month}-${day}`} style={{
                minHeight:78, padding:'6px 2px 5px',
                display:'flex', flexDirection:'column', alignItems:'center', gap:2,
                background: isToday ? 'rgba(255,255,255,0.06)' : 'transparent',
                ...borderStyle,
              }}>
                <div style={{
                  width:26, height:26, borderRadius:'50%', flexShrink:0,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  background: isToday ? 'rgba(96,184,255,0.55)' : 'transparent',
                  boxShadow: isToday ? '0 0 10px rgba(96,184,255,0.4)' : 'none',
                }}>
                  <span style={{ fontSize:12, fontWeight:isToday?700:500, color:isToday?'#fff':dateCol }}>{day}</span>
                </div>
                {holiday && <span style={{ fontSize:8, color:'#FF8585', fontWeight:600, lineHeight:1.2, textAlign:'center', letterSpacing:-.2 }}>{holiday}</span>}
                {event   && <span style={{ fontSize:8, color:'rgba(255,255,255,0.70)', lineHeight:1.3, textAlign:'center', letterSpacing:-.3, wordBreak:'keep-all' }}>{event}</span>}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ height:'max(48px,calc(env(safe-area-inset-bottom) + 36px))' }} />
    </div>
  )
}

// --- WeatherBadge (메인 화면용 소형 뱃지) ---
function WeatherBadge({ forecasts }: { forecasts: ForecastItem[] | null }) {
  if (!forecasts || forecasts.length === 0) return null

  const now      = getKSTNow()
  const day      = now.getUTCDay()    // KST 요일 (.getUTCDay() = KST-shifted date의 UTC 요일 = 실제 KST 요일)
  const hour     = now.getUTCHours()  // KST 시각

  const isSat    = day === 6
  const isRunDay = day === 1 || day === 3 || isSat

  // 토요일: 06시 러닝 / 월·수: 20시 러닝
  const runTimeStr = isSat ? '0600' : '2000'
  const runLabel   = isSat ? '06시' : '20시'
  const beforeRun  = isSat ? hour < 8 : hour < 20

  const near    = forecasts[0]
  // 토요일은 0600 슬롯 우선, 없으면 0700 (API 발표 시점에 따라 슬롯이 다를 수 있음)
  const running = forecasts.find(f => f.time === runTimeStr)
               ?? (isSat ? forecasts.find(f => f.time === '0700') : undefined)
  const runRain = running && running.pty !== '0'

  const hasLgt = near.lgt === '1'

  return (
    <>
      {/* 낙뢰 경보 */}
      {hasLgt && (
        <div className="flex items-center gap-1.5 rounded-full px-3 py-1 border text-xs font-medium bg-yellow-400/15 border-yellow-400/40 text-yellow-300">
          <span style={{ fontSize: 14 }}>⚡</span>
          <span>낙뢰 주의</span>
        </div>
      )}

      {/* Caption — 현재 날씨 */}
      <div className="flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full px-3 py-1 text-white">
        <span style={{ fontSize: 14 }}>{ptyIcon(near.pty, near.sky)}</span>
        <span style={{ fontSize: 12, opacity: .75 }}>
          {near.time.slice(0, 2)}시 {ptyLabel(near.pty, near.sky)}
        </span>
      </div>

      {/* Caption — 러닝 예보 (운동일 + 20시 이전 + 데이터 있을 때) */}
      {isRunDay && beforeRun && running && (
        <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 border text-xs font-medium ${
          runRain
            ? 'bg-blue-400/15 border-blue-400/30 text-blue-300'
            : 'bg-green-400/10 border-green-400/25 text-green-300'
        }`}>
          <span style={{ fontSize: 14 }}>{ptyIcon(running.pty, running.sky)}</span>
          <span>{runLabel} 러닝 {runRain ? '비 예보' : '맑음'}</span>
        </div>
      )}
    </>
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
  const [airData,   setAirData]   = useState<AirData>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // PIN
  const [pinDigits, setPinDigits] = useState(['', '', '', ''])
  const [pinError, setPinError]   = useState(false)
  const [pinLoading, setPinLoading] = useState(false)
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
  const [attendanceError, setAttendanceError] = useState(false)
  const [selectError, setSelectError]       = useState(false)

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
    const load = () =>
      fetch('/api/weather')
        .then(r => r.json())
        .then(d => setForecasts((d.forecasts ?? null) as ForecastItem[] | null))
        .catch(() => {})
    load()
    // 30분마다 자동 갱신 (기상청 초단기예보 발표 주기와 동일)
    const t = setInterval(load, 30 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  // 대기질 1시간마다 갱신 (에어코리아 업데이트 주기)
  useEffect(() => {
    const loadAir = () =>
      fetch('/api/air')
        .then(r => r.json())
        .then(d => { if (!d.error) setAirData(d as AirData) })
        .catch(() => {})
    loadAir()
    const t = setInterval(loadAir, 60 * 60 * 1000)
    return () => clearInterval(t)
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
    try {
      const now = getKSTNow()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const { data: resetData } = await supabase
        .from('leaderboard_resets').select('reset_at')
        .order('reset_at', { ascending: false }).limit(1).maybeSingle()
      const resetDate = resetData?.reset_at?.slice(0, 10)
      const startDate = resetDate && resetDate > monthStart ? resetDate : monthStart
      const { data: sessionData } = await supabase.from('sessions').select('id').gte('date', startDate)
      const sessionIds = (sessionData ?? []).map((s: { id: number }) => s.id)
      if (sessionIds.length === 0) { setLeaderboard([]); return }
      const { data } = await supabase
        .from('attendance').select('member_id, members!inner(name)').in('session_id', sessionIds)
      setLeaderboard(computeRanks((data ?? []) as unknown as AttendanceRow[]))
    } catch {
      setLeaderboard([])
    } finally {
      setLeaderboardLoading(false)
    }
  }

  async function loadAttendanceData() {
    setAttendanceLoading(true)
    setAttendanceError(false)
    try {
      const today = getTodayKST()
      const [{ data: existing }, { data: membersData }] = await Promise.all([
        supabase.from('sessions').select('id').eq('date', today).maybeSingle(),
        supabase.from('members').select('*').order('name'),
      ])
      setMembers(membersData ?? [])

      let sid: number | null = existing?.id ?? null
      if (!sid) {
        const { data: created, error } = await supabase
          .from('sessions')
          .upsert({ date: today }, { onConflict: 'date' })
          .select('id')
          .single()
        if (error || !created?.id) { setAttendanceError(true); return }
        sid = created.id
      }
      setSessionId(sid)
      const { data: attendanceData } = await supabase
        .from('attendance').select('member_id').eq('session_id', sid)
      setCheckedInIds(new Set((attendanceData ?? []).map((a: { member_id: number }) => a.member_id)))
    } catch {
      setAttendanceError(true)
    } finally {
      setAttendanceLoading(false)
    }
  }

  async function handleSelect(member: Member) {
    if (checkedInIds.has(member.id)) return
    setSelectError(false)

    let sid = sessionId
    if (!sid) {
      const today = getTodayKST()
      const { data: created, error } = await supabase
        .from('sessions')
        .upsert({ date: today }, { onConflict: 'date' })
        .select('id')
        .single()
      if (error || !created?.id) {
        setSelectError(true)
        setTimeout(() => setSelectError(false), 3000)
        return
      }
      sid = created.id
      setSessionId(sid)
    }

    setCheckedInIds(prev => new Set(prev).add(member.id))
    setDoneName(member.name)
    setStep('done')
    const { error } = await supabase
      .from('attendance')
      .insert({ session_id: sid, member_id: member.id })
    if (error) {
      setCheckedInIds(prev => { const s = new Set(prev); s.delete(member.id); return s })
      setStep('search')
      setDoneName('')
      setSelectError(true)
      setTimeout(() => setSelectError(false), 3000)
    }
  }

  async function handlePinDigit(idx: number, val: string) {
    if (!/^\d*$/.test(val) || pinLoading) return
    const next = [...pinDigits]
    next[idx] = val.slice(-1)
    setPinDigits(next)
    setPinError(false)
    if (val && idx < 3) pinRefs.current[idx + 1]?.focus()
    if (next.every(d => d !== '')) {
      setPinLoading(true)
      try {
        const valid = await validatePin(next.join(''))
        if (valid) {
          setView('attendance'); setPinDigits(['', '', '', ''])
        } else {
          setPinError(true); setPinDigits(['', '', '', ''])
          setTimeout(() => pinRefs.current[0]?.focus(), 50)
        }
      } catch {
        // 서버 오류 → 틀린 것으로 처리
        setPinError(true); setPinDigits(['', '', '', ''])
        setTimeout(() => pinRefs.current[0]?.focus(), 50)
      } finally {
        setPinLoading(false)
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
          ) : attendanceError ? (
            <div className="text-center py-10">
              <p className="text-red-400/80 text-sm mb-4">데이터를 불러오지 못했습니다.</p>
              <button onClick={() => loadAttendanceData()}
                className="px-5 py-2.5 rounded-xl text-sm font-medium bg-white/10 border border-white/20 text-white/70 hover:bg-white/15 transition-all">
                다시 시도
              </button>
            </div>
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
          {selectError && (
            <p className="text-center text-red-400/80 text-sm mt-3">출석 처리 중 오류가 발생했습니다. 다시 시도해주세요.</p>
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
        autoPlay muted playsInline preload="auto"
        onLoadedData={e => { e.currentTarget.currentTime = GAME_BG_FRAME; e.currentTarget.pause() }}
        className="absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-500"
        style={{ opacity: pageIndex === 0 ? 1 : 0 }}
        src={VIDEO_INTRO}
      />
      <div
        className="absolute inset-0 bg-black/55 transition-opacity duration-500"
        style={{ opacity: pageIndex === 0 ? 1 : 0 }}
      />

      {/* 배경 2: 캘린더 페이지 */}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{ opacity: pageIndex === 1 ? 1 : 0, background: 'linear-gradient(180deg,#0a1628 0%,#0f1e3a 55%,#0a1628 100%)' }}
      />

      {/* 배경 3: 날씨 페이지 (그라디언트) */}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{ opacity: pageIndex === 2 ? 1 : 0, background: getWeatherBg(forecasts) }}
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
                  disabled={pinLoading}
                  onChange={e => handlePinDigit(i, e.target.value)}
                  onKeyDown={e => handlePinKeyDown(i, e)}
                  className={`w-12 h-14 text-center text-2xl font-bold bg-white/10 border rounded-xl text-white outline-none transition-all ${pinLoading ? 'opacity-50 cursor-not-allowed' : ''} ${pinError ? 'border-red-400/60 bg-red-400/10' : 'border-white/20 focus:border-white/50 focus:bg-white/15'}`}
                />
              ))}
            </div>
            {pinLoading && <p className="text-white/50 text-xs mb-3">확인 중...</p>}
            {!pinLoading && pinError && <p className="text-red-400 text-xs mb-3">코드가 틀렸습니다</p>}
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
          <p className="text-sm text-white/40 mb-3">매주 월·수·토 함께 달려요</p>
          <div className="flex items-center gap-2 flex-wrap justify-center mb-5">
            <WeatherBadge forecasts={forecasts} />
            <AirBadge airData={airData} />
          </div>

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

        {/* Panel 2: 캘린더 */}
        <div
          className="flex-none overflow-hidden"
          style={{ width: '100vw', height: '100dvh', scrollSnapAlign: 'start' }}
        >
          <CalendarPage />
        </div>

        {/* Panel 3: 날씨 */}
        <div
          className="flex-none overflow-y-auto overflow-x-hidden"
          style={{ width: '100vw', height: '100dvh', scrollSnapAlign: 'start' }}
        >
          <WeatherPage forecasts={forecasts} airData={airData} />
        </div>
      </div>

      {/* 페이지 인디케이터 (탭 가능) — 3개 */}
      <div className="fixed bottom-8 left-0 right-0 flex justify-center gap-3 z-20">
        {[0, 1, 2].map(idx => (
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
