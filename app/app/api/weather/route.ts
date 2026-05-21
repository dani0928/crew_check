import { NextResponse } from 'next/server'

const NX = 57
const NY = 112

function getKSTNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
}

function getBaseDateTime() {
  const now = getKSTNow()
  // 초단기예보: 매시간 30분 발표 → 30분 이전이면 이전 시간 기준
  if (now.getMinutes() < 30) {
    now.setHours(now.getHours() - 1) // 자동으로 날짜도 롤백됨
  }
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  return { base_date: `${yyyy}${mm}${dd}`, base_time: `${hh}30` }
}

export async function GET() {
  const key = process.env.KMA_SERVICE_KEY
  if (!key) return NextResponse.json({ error: 'no key' }, { status: 500 })

  const { base_date, base_time } = getBaseDateTime()

  const params = new URLSearchParams({
    serviceKey: key,
    pageNo: '1',
    numOfRows: '60',
    dataType: 'JSON',
    base_date,
    base_time,
    nx: String(NX),
    ny: String(NY),
  })

  let json: Record<string, unknown>
  try {
    const res = await fetch(
      `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst?${params}`,
      { next: { revalidate: 1800 } }
    )
    json = await res.json()
  } catch {
    return NextResponse.json({ error: 'fetch failed' }, { status: 502 })
  }

  const body = (json as { response?: { body?: { items?: { item?: unknown[] } } } })?.response?.body
  const items = (body?.items?.item ?? []) as Array<{
    fcstTime: string
    category: string
    fcstValue: string
  }>

  const byTime = new Map<string, Record<string, string>>()
  for (const item of items) {
    if (!byTime.has(item.fcstTime)) byTime.set(item.fcstTime, {})
    byTime.get(item.fcstTime)![item.category] = item.fcstValue
  }

  const forecasts = [...byTime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 6)
    .map(([time, data]) => ({
      time,
      pty: data['PTY'] ?? '0',
      sky: data['SKY'] ?? '1',
      t1h: data['T1H'] ?? '',
    }))

  return NextResponse.json({ base_date, base_time, forecasts })
}
