import { NextResponse } from 'next/server'

const STATION_NAME = '동탄'
const BASE_URL = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty'

function gradeLabel(grade: string) {
  if (grade === '1') return '좋음'
  if (grade === '2') return '보통'
  if (grade === '3') return '나쁨'
  if (grade === '4') return '매우나쁨'
  return '-'
}

export async function GET() {
  const key = process.env.KMA_SERVICE_KEY   // 공공데이터포털 공통 인증키
  if (!key) return NextResponse.json({ error: 'no key' }, { status: 500 })

  const params = new URLSearchParams({
    serviceKey: key,
    returnType:  'json',
    numOfRows:   '1',
    pageNo:      '1',
    stationName: STATION_NAME,
    dataTerm:    'DAILY',
    ver:         '1.0',
  })

  try {
    const res = await fetch(`${BASE_URL}?${params}`, {
      next: { revalidate: 3600 }, // 에어코리아는 1시간마다 업데이트
    })
    const json = await res.json()
    const item = json?.response?.body?.items?.[0]
    if (!item) return NextResponse.json({ error: 'no data' }, { status: 502 })

    return NextResponse.json({
      pm25:       item.pm25Value  ?? '-',
      pm25Grade:  item.pm25Grade  ?? '0',
      pm25Label:  gradeLabel(item.pm25Grade),
      pm10:       item.pm10Value  ?? '-',
      pm10Grade:  item.pm10Grade  ?? '0',
      pm10Label:  gradeLabel(item.pm10Grade),
      dataTime:   item.dataTime   ?? '',
      station:    STATION_NAME,
    })
  } catch {
    return NextResponse.json({ error: 'fetch failed' }, { status: 502 })
  }
}
