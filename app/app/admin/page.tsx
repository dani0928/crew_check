// 운영진용 출석 현황 및 크루원 관리 페이지
'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase, Member } from '@/lib/supabase'

type SessionRow    = { id: number; date: string }
type AttendanceRow = { member_id: number; members: { name: string } }
type MonthStat     = { name: string; count: number }
type CalEvent      = { id: number; event_date: string; title: string }

export default function AdminPage() {
  const [tab, setTab] = useState<'attendance' | 'members' | 'stats' | 'calendar'>('attendance')
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [attendees, setAttendees] = useState<string[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [newName, setNewName] = useState('')
  const [monthStats, setMonthStats] = useState<MonthStat[]>([])
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(false)
  const [lastReset, setLastReset] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 일정 관리 — 일괄 편집
  const today = new Date()
  const [calYear,    setCalYear]    = useState(today.getFullYear())
  const [calMonth,   setCalMonth]   = useState(today.getMonth() + 1)
  const [dayInputs,  setDayInputs]  = useState<Record<number, string>>({})
  const [calSaving,  setCalSaving]  = useState(false)
  const [calSaved,   setCalSaved]   = useState(false)

  useEffect(() => { loadSessions(); loadMembers(); loadLastReset() }, [])
  useEffect(() => { if (selectedDate) loadAttendance(selectedDate) }, [selectedDate])
  useEffect(() => { if (tab === 'stats') loadMonthStats(selectedMonth) }, [tab, selectedMonth])
  useEffect(() => { if (tab === 'calendar') loadCalEvents() }, [tab, calYear, calMonth])

  async function loadLastReset() {
    const { data } = await supabase
      .from('leaderboard_resets')
      .select('reset_at')
      .order('reset_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setLastReset(data?.reset_at ?? null)
  }

  async function handleResetLeaderboard() {
    if (!confirm('리더보드 순위를 지금부터 다시 집계합니다. 계속할까요?')) return
    await supabase.from('leaderboard_resets').insert({ reset_at: new Date().toISOString() })
    await loadLastReset()
    alert('순위가 초기화됐습니다.')
  }

  async function loadSessions() {
    const { data } = await supabase.from('sessions').select('id, date').order('date', { ascending: false })
    setSessions(data ?? [])
    if (data?.length) setSelectedDate(data[0].date)
  }

  async function loadAttendance(date: string) {
    setLoading(true)
    const { data: session } = await supabase.from('sessions').select('id').eq('date', date).single()
    if (!session) { setAttendees([]); setLoading(false); return }
    const { data } = await supabase.from('attendance').select('member_id, members(name)').eq('session_id', session.id)
    setAttendees((data as unknown as AttendanceRow[] ?? []).map(a => a.members.name).sort())
    setLoading(false)
  }

  async function loadMembers() {
    const { data } = await supabase.from('members').select('*').order('name')
    setMembers(data ?? [])
  }

  async function handleAddMember() {
    const name = newName.trim()
    if (!name) return
    await supabase.from('members').insert({ name })
    setNewName('')
    loadMembers()
  }

  async function handleDeleteMember(id: number) {
    if (!confirm('삭제하면 해당 크루원의 출석 기록도 모두 삭제됩니다. 계속할까요?')) return
    await supabase.from('attendance').delete().eq('member_id', id)
    await supabase.from('members').delete().eq('id', id)
    loadMembers()
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const names = text.split('\n').map(l => l.trim()).filter(Boolean)
    await supabase.from('members').insert(names.map(name => ({ name })))
    loadMembers()
    if (fileRef.current) fileRef.current.value = ''
  }

  function calDaysInMonth() { return new Date(calYear, calMonth, 0).getDate() }
  function calPad(n: number) { return String(n).padStart(2, '0') }

  async function loadCalEvents() {
    const dim   = calDaysInMonth()
    const start = `${calYear}-${calPad(calMonth)}-01`
    const end   = `${calYear}-${calPad(calMonth)}-${calPad(dim)}`
    const { data } = await supabase
      .from('calendar_events')
      .select('event_date, title')
      .gte('event_date', start)
      .lte('event_date', end)
    const map: Record<number, string> = {}
    for (const e of data ?? []) {
      const d = parseInt(e.event_date.split('-')[2])
      map[d] = e.title
    }
    setDayInputs(map)
    setCalSaved(false)
  }

  async function handleSaveAllEvents() {
    setCalSaving(true)
    const p    = calPad
    const dim  = calDaysInMonth()
    const start = `${calYear}-${p(calMonth)}-01`
    const end   = `${calYear}-${p(calMonth)}-${p(dim)}`

    // 해당 월 전체 삭제 후 재삽입 (가장 단순하고 확실한 방식)
    await supabase.from('calendar_events').delete()
      .gte('event_date', start).lte('event_date', end)

    const inserts = Object.entries(dayInputs)
      .filter(([, title]) => title.trim())
      .map(([day, title]) => ({
        event_date: `${calYear}-${p(calMonth)}-${p(Number(day))}`,
        title: title.trim(),
      }))

    if (inserts.length) await supabase.from('calendar_events').insert(inserts)

    setCalSaving(false)
    setCalSaved(true)
    setTimeout(() => setCalSaved(false), 2500)
  }

  async function loadMonthStats(month: string) {
    setLoading(true)
    const { data: sessionData } = await supabase.from('sessions').select('id').gte('date', `${month}-01`).lte('date', `${month}-31`)
    const sessionIds = (sessionData ?? []).map(s => s.id)
    if (!sessionIds.length) { setMonthStats([]); setLoading(false); return }
    const { data } = await supabase.from('attendance').select('member_id, members(name)').in('session_id', sessionIds)
    const countMap: Record<string, number> = {}
    ;(data as unknown as AttendanceRow[] ?? []).forEach(a => {
      const name = a.members.name
      countMap[name] = (countMap[name] ?? 0) + 1
    })
    setMonthStats(Object.entries(countMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count))
    setLoading(false)
  }

  async function exportCSV() {
    const { data: allSessions } = await supabase.from('sessions').select('id, date').order('date', { ascending: true })
    if (!allSessions?.length) return
    const rows: string[] = ['날짜,출석인원,참석자']
    for (const session of allSessions) {
      const { data } = await supabase.from('attendance').select('members(name)').eq('session_id', session.id)
      const names = (data as unknown as { members: { name: string } }[] ?? []).map(a => a.members.name).sort()
      rows.push(`"${session.date}",${names.length},"${names.join(', ')}"`)
    }
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `출석기록_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const tabs = [
    { key: 'attendance', label: '출석 현황' },
    { key: 'members',    label: '크루원 관리' },
    { key: 'stats',      label: '월별 통계' },
    { key: 'calendar',   label: '일정 관리' },
  ] as const

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-lg mx-auto px-5 pt-12 pb-16">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <a href="/" className="text-xs text-gray-400 mb-0.5 hover:text-gray-600 transition-colors">← 초기화면으로</a>
            <h1 className="text-2xl font-bold text-gray-900">운영진 관리</h1>
          </div>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-900 text-white rounded-2xl text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            ↓ CSV
          </button>
        </div>

        {/* 탭 */}
        <div className="flex bg-gray-100 rounded-2xl p-1 mb-8">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 출석 현황 */}
        {tab === 'attendance' && (
          <div className="space-y-5">
            <select
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-full p-4 rounded-2xl bg-gray-50 text-gray-900 text-sm outline-none"
            >
              {sessions.map(s => <option key={s.id} value={s.date}>{s.date}</option>)}
            </select>

            {loading ? (
              <p className="text-center text-gray-300 py-12">불러오는 중...</p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-400">{attendees.length}명 출석</p>
                <div className="space-y-2">
                  {attendees.map(name => (
                    <div key={name} className="flex items-center gap-3 bg-gray-50 rounded-2xl px-5 py-4">
                      <span className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center text-green-500 text-xs font-bold">✓</span>
                      <span className="text-gray-900 font-medium">{name}</span>
                    </div>
                  ))}
                  {attendees.length === 0 && (
                    <p className="text-center text-gray-300 py-12">출석 기록이 없습니다.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* 크루원 관리 */}
        {tab === 'members' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddMember()}
                placeholder="이름 입력"
                className="flex-1 bg-gray-50 rounded-2xl px-5 py-4 text-sm text-gray-900 outline-none"
              />
              <button
                onClick={handleAddMember}
                className="px-5 py-4 bg-gray-900 text-white rounded-2xl text-sm font-medium"
              >
                추가
              </button>
            </div>

            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleCSVImport} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full py-4 rounded-2xl border border-dashed border-gray-200 text-sm text-gray-400 hover:bg-gray-50 transition-colors"
            >
              CSV 파일로 일괄 등록
            </button>

            <p className="text-xs text-gray-400 px-1">총 {members.length}명</p>
            <div className="space-y-2">
              {members.map(m => (
                <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-2xl px-5 py-4">
                  <span className="text-gray-900 font-medium">{m.name}</span>
                  <button onClick={() => handleDeleteMember(m.id)} className="text-xs text-gray-300 hover:text-red-400 transition-colors">
                    삭제
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 월별 통계 */}
        {tab === 'stats' && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-2xl px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">리더보드 순위 초기화</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {lastReset
                    ? `마지막 초기화: ${new Date(lastReset).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`
                    : '초기화 기록 없음 (이번 달 기준 집계 중)'}
                </p>
              </div>
              <button
                onClick={handleResetLeaderboard}
                className="px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
              >
                초기화
              </button>
            </div>

            <input
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="w-full bg-gray-50 rounded-2xl px-5 py-4 text-sm text-gray-900 outline-none"
            />

            {loading ? (
              <p className="text-center text-gray-300 py-12">불러오는 중...</p>
            ) : monthStats.length === 0 ? (
              <p className="text-center text-gray-300 py-12">이달 출석 기록이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {monthStats.map(({ name, count }, i) => (
                  <div key={name} className="flex items-center justify-between bg-gray-50 rounded-2xl px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                      <span className="text-gray-900 font-medium">{name}</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{count}회</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* 일정 관리 — 월별 일괄 편집 */}
        {tab === 'calendar' && (() => {
          const dim  = calDaysInMonth()
          const days = Array.from({ length: dim }, (_, i) => i + 1)
          const DOW  = ['일','월','화','수','목','금','토']
          return (
            <div className="space-y-4">
              {/* 월 이동 */}
              <div className="flex items-center justify-between bg-gray-50 rounded-2xl px-5 py-3">
                <button
                  onClick={() => calMonth === 1 ? (setCalYear(y=>y-1), setCalMonth(12)) : setCalMonth(m=>m-1)}
                  className="text-gray-400 hover:text-gray-700 text-xl px-2"
                >‹</button>
                <span className="text-sm font-semibold text-gray-800">{calYear}년 {calMonth}월</span>
                <button
                  onClick={() => calMonth === 12 ? (setCalYear(y=>y+1), setCalMonth(1)) : setCalMonth(m=>m+1)}
                  className="text-gray-400 hover:text-gray-700 text-xl px-2"
                >›</button>
              </div>

              {/* 날짜별 입력 */}
              <div className="space-y-1.5">
                {days.map(d => {
                  const dow    = new Date(calYear, calMonth - 1, d).getDay()
                  const isSun  = dow === 0
                  const isSat  = dow === 6
                  const dateColor = isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-gray-500'
                  const hasVal = !!(dayInputs[d]?.trim())
                  return (
                    <div key={d} className="flex items-center gap-3">
                      {/* 날짜 레이블 */}
                      <span className={`text-xs font-medium w-16 flex-shrink-0 ${dateColor}`}>
                        {calMonth}/{calPad(d)} ({DOW[dow]})
                      </span>
                      {/* 입력 필드 */}
                      <input
                        value={dayInputs[d] ?? ''}
                        onChange={e => setDayInputs(prev => ({ ...prev, [d]: e.target.value }))}
                        placeholder="일정 없음"
                        className={`flex-1 rounded-xl px-4 py-2.5 text-sm outline-none transition-colors
                          ${hasVal
                            ? 'bg-gray-900 text-white placeholder-gray-600'
                            : 'bg-gray-50 text-gray-900 placeholder-gray-300'
                          }`}
                      />
                    </div>
                  )
                })}
              </div>

              {/* 저장 버튼 */}
              <button
                onClick={handleSaveAllEvents}
                disabled={calSaving}
                className={`w-full py-4 rounded-2xl text-sm font-semibold transition-all
                  ${calSaved
                    ? 'bg-green-500 text-white'
                    : calSaving
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-900 text-white hover:bg-gray-700'
                  }`}
              >
                {calSaved ? '✓ 저장됐습니다' : calSaving ? '저장 중...' : `${calYear}년 ${calMonth}월 일괄 저장`}
              </button>
            </div>
          )
        })()}

      </div>
    </main>
  )
}
