# 러닝크루 부스터 — Crew Check

러닝크루 **부스터**의 정기 달리기 출석 체크 + 날씨 정보 웹앱.

---

## 프로젝트 개요

| 항목 | 내용 |
|------|------|
| URL | https://crew-check-three.vercel.app |
| 레포 | https://github.com/dani0928/crew_check |
| 스택 | Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4 |
| DB | Supabase (PostgreSQL) |
| 배포 | Vercel (Production: `master` 브랜치) |
| 폰트 | Pretendard (CDN) |

---

## 디렉토리 구조

```
crew_check/
├── app/                        # Next.js 프로젝트 루트
│   ├── app/
│   │   ├── page.tsx            # 메인 페이지 (공개 + 출석 체크 + 날씨)
│   │   ├── layout.tsx          # 루트 레이아웃 (Pretendard 폰트, Analytics)
│   │   ├── globals.css         # 전역 스타일
│   │   ├── admin/
│   │   │   └── page.tsx        # 운영진 관리 페이지
│   │   ├── api/
│   │   │   └── weather/
│   │   │       └── route.ts    # 기상청 초단기예보 API 프록시
│   │   └── actions/            # Server Actions
│   ├── components/
│   │   ├── DinoGame.tsx        # 다이노게임 (미니게임)
│   │   └── FlappyGame.tsx      # 플래피버드 (미니게임)
│   ├── lib/
│   │   └── supabase.ts         # Supabase 클라이언트 + 타입
│   └── .env.local              # 환경변수 (로컬)
├── supabase-schema.sql         # DB 스키마
└── CLAUDE.md                   # 이 파일
```

---

## 환경 변수

| 변수 | 위치 | 설명 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + .env.local | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + .env.local | Supabase anon 키 |
| `KMA_SERVICE_KEY` | Vercel + .env.local | 기상청 공공데이터포털 인증키 (서버 전용) |

---

## DB 스키마 (Supabase)

```sql
members     (id, name, created_at)
sessions    (id, date, created_at)               -- 날짜별 출석 세션
attendance  (id, session_id, member_id, checked_in_at)  -- unique(session_id, member_id)
leaderboard_resets (id, reset_at)                -- 월별 리셋 기록
game_scores (id, game, name, score, created_at)  -- 미니게임 점수
```

RLS: 모든 테이블 anon key로 읽기/쓰기 허용

---

## 화면 구조

### 1. 메인 공개 화면 (`/`)

```
배경: BOOSTER_INTRO.webm 1초 프레임 정지
──────────────────────────────────
[로고 (탭 → PIN 입력)]
러닝크루 부스터          ← H2 22px/600
매주 월·수·토 함께 달려요  ← Body S 14px/400

[날씨 뱃지]
  ☁️ 13시 흐림          ← 현재 날씨
  ✅ 20시 러닝 맑음      ← 운동일 + 20시 이전일 때만 표시

[누적 출석 순위 ▾]       ← 접기/펼치기
[미니게임 ▾]             ← 접기/펼치기 (기본값: 닫힘)
  🦕 다이노게임 | 🐦 플래피버드

[●  ○] ← 페이지 인디케이터 (스와이프)
```

**스와이프 → 날씨 페이지**

```
[동탄 여울공원]          ← H2 22px/600
[화성시 · HH:MM 기준]    ← Caption 12px
[19°]                    ← Display clamp(72~90px)/100
[흐림]                   ← Body 16px/400
[최고 19° · 최저 18°]    ← Body S 14px/400

[시간별 예보 카드]       ← Label 11px/600 UPPERCASE
  지금  14시  15시  ...  ← Caption 12px
  ☁️    ☁️    ☁️         ← 20px
  19°   19°   18°        ← Body S 14px/500

[날씨누리 지도 iframe]   ← flex:1 나머지 공간 전체
  초단기강수예측 레이더 지도 (기상청 공식)
  위치: 동탄 여울공원 (lat=37.1994, lon=127.0859)
```

### 2. 출석 체크 화면

PIN 입력(4자리: `2019`) 후 진입:
```
이름 검색 → 출석 완료 (컨페티 애니메이션)
```
- 오늘 session 없으면 자동 생성
- 중복 체크인 방지 (unique 제약)
- 관리자 이름 검색 시 운영진 관리 페이지 링크 노출

### 3. 운영진 관리 페이지 (`/admin`)

- 멤버 추가/삭제
- 출석 세션 관리
- 리더보드 리셋

---

## 날씨 API

| 항목 | 내용 |
|------|------|
| 출처 | 기상청 공공데이터포털 (`data.go.kr`) |
| API | `getUltraSrtFcst` (초단기예보, 매시간 30분 발표) |
| 위치 | 동탄 여울공원 nx=62, ny=119 (KMA LCC 공식 역산) |
| 캐싱 | 30분 revalidate (`next: { revalidate: 1800 }`) |
| 응답 | PTY(강수형태), SKY(하늘상태), T1H(기온) × 6시간 |

**PTY 코드:** 0=없음, 1=비, 2=비/눈, 3=눈, 5=빗방울, 6=빗방울눈날림, 7=눈날림  
**SKY 코드:** 1=맑음, 3=구름많음, 4=흐림

날씨 지도: `https://www.weather.go.kr/wgis-nuri/html/map.html?location=127.085934987551,37.1993699999133`

---

## 타이포그래피 규정

**폰트:** Pretendard (CDN) → -apple-system → BlinkMacSystemFont → sans-serif

| 레벨 | 크기 | 굵기 | 용도 |
|------|------|------|------|
| Display | clamp(72px, 19vw, 90px) | 100 | 기온 등 핵심 수치 |
| H1 | 30px | 700 | 페이지 제목 (출석 체크) |
| H2 | 22px | 600 | 앱 이름, 도시명 |
| H3 | 20px | 600 | 섹션 제목, 탭 레이블 |
| Body L | 18px | 500 | 입력창 텍스트 |
| Body | 16px | 400 | 일반 콘텐츠 (이름, 날씨 조건) |
| Body S | 14px | 400–500 | 보조 텍스트, 기온 수치 |
| Caption | 12px | 400 | 타임스탬프, 부제목 |
| Label | 11px | 600 | 섹션 라벨 (UPPERCASE + letterSpacing 1.5) |

**강조 원칙**
- 수치/핵심 정보 → 크기로 강조
- 계층 표현 → opacity (primary 1.0 / secondary 0.65 / muted 0.45)
- 섹션 구분 → Label (11px 600 UPPERCASE letterSpacing 1.5)
- 상호작용 요소 → weight 500+

---

## 날씨 페이지 배경 그라디언트

| 조건 | 낮 | 밤 |
|------|----|----|
| 맑음 | `#1e8edc → #0c4aaa` | `#080e20 → #101e3c` |
| 구름많음 | `#4278a0 → #306080` | `#162040 → #203052` |
| 흐림 | `#606e7c → #48565e` | `#18202e → #242e3c` |
| 비 | `#36505e → #243848` | `#10182a → #1a2638` |
| 눈 | `#a0bdd2 → #7098b4` | `#1e2d3d → #2a3d52` |
| 석양 (17~20시) | `#d84f1a → #8a2888 → #1a2a60` | — |
| 새벽 (5~7시) | `#d4724a → #a83882 → #3448a0` | — |

---

## 날씨 애니메이션 (CSS)

| 조건 | 애니메이션 |
|------|-----------|
| 맑음 | 태양 + 회전 광선 8개 + radial 글로우 펄스 |
| 구름많음 | 작은 태양(왼쪽) + 큰 IosCloud 드리프트 |
| 흐림 | IosCloud 3개 반대 방향 드리프트 |
| 비 | 어두운 IosCloud + 32개 빗방울 10도 사선 |
| 눈 | IosCloud + 22개 눈송이 좌우 흩날림 |

`IosCloud`: 여러 원을 겹쳐 구름 형태 만들고 `filter: blur(18px)` 그룹 적용

---

## 주요 컴포넌트 (page.tsx)

| 컴포넌트 | 역할 |
|---------|------|
| `WeatherBadge` | 메인 화면 소형 날씨 뱃지 (현재 날씨 + 러닝 예보) |
| `WeatherAnimation` | 날씨 조건별 CSS 파티클 애니메이션 배경 |
| `WeatherPage` | 날씨 풀스크린 페이지 (iOS Weather 스타일) |
| `IosCloud` | 흐릿한 구름 CSS 컴포넌트 |
| `Leaderboard` | 누적 출석 순위 (접기/펼치기) |
| `HomePage` | 메인 컴포넌트 — 스와이프 페이지, PIN, 출석 체크 |

---

## 스와이프 네비게이션

CSS `scroll-snap` 방식 (touch 이벤트 아님):

```
overflow-x: scroll
scroll-snap-type: x mandatory
각 패널: scroll-snap-align: start
```

- Panel 1: 메인 (로고 + 리더보드 + 미니게임)
- Panel 2: 날씨 (iOS Weather 스타일)
- 하단 도트: 탭 가능 (`scrollToPage(idx)`)
- 배경 전환: opacity로 크로스페이드

---

## 배포 방법

```bash
# 로컬 개발
cd crew_check/app && npm run dev

# 프로덕션 배포 (git 루트에서 실행해야 함)
cd crew_check
git push origin master
vercel --prod
```

> ⚠️ `vercel --prod`는 반드시 `crew_check/` (git 루트)에서 실행  
> `crew_check/app/`에서 실행하면 `rootDirectory: app` 설정 충돌로 빌드 실패

---

## 알려진 제약

- 기상청 초단기예보는 현재 시각 기준 +1h~+6h 범위만 제공 (현재 시각 실황 없음)
- 오후 8시 러닝 예보는 오후 2시 30분 이후부터 6시간 범위에 포함됨
- 날씨누리 iframe은 X-Frame-Options에 따라 일부 환경에서 차단될 수 있음
- KMA 서비스키는 서버 전용 (`KMA_SERVICE_KEY`, `NEXT_PUBLIC_` 없음)
