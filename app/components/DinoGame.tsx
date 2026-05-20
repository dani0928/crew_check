'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// --- Constants (adapted from github.com/CodingWith-Adam/dino-game, scale ×0.75 from 800×200) ---
const W = 600, H = 180

const PW = 44, PH = 47, PX = 8         // player size & x position
const GND_W = 1800, GND_H = 18         // ground image tile size
const GND_Y = H - GND_H               // 162 — ground line y
const STAND_Y = GND_Y - PH            // 115 — player resting y

const JUMP_V = 0.65     // px/ms  initial upward velocity
const GRAV_ACC = 0.002  // px/ms² gravity acceleration

const SPEED_START = 1
const SPEED_INC = 0.00001   // gameSpeed increment per ms
const CACTUS_SPD = 0.375    // px per (gameSpeed × ms)  (ref: 0.5 × 0.75)

const CACTUS_MIN_MS = 500
const CACTUS_MAX_MS = 2000
const WALK_TIMER_MS = 200   // ms between run-frame swap

// Cactus sizes (ref: [48,100], [98,100], [68,70] ÷1.5 ×0.75)
const CACTI_DEF = [
  { w: 24, h: 52 },  // 좁고 보통
  { w: 52, h: 68 },  // 넓고 큰 (big cactus)
  { w: 34, h: 36 },  // 낮고 짧은
] as const

type Phase = 'idle' | 'playing' | 'gameover'
interface Cactus { x: number; y: number; w: number; h: number; type: 0 | 1 | 2 }
interface ScoreEntry { member_name: string; score: number }

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min)
}

export function DinoGame() {
  const cvs = useRef<HTMLCanvasElement>(null)
  const raf = useRef(0)
  const prevT = useRef<number | null>(null)
  const phaseRef = useRef<Phase>('idle')

  const imgs = useRef<{
    run: [HTMLImageElement, HTMLImageElement]
    stand: HTMLImageElement
    cactus: [HTMLImageElement, HTMLImageElement, HTMLImageElement]
    ground: HTMLImageElement
  } | null>(null)

  const gs = useRef({
    py: STAND_Y, vy: 0,
    grounded: true, jumpPressed: false, jumpInProgress: false,
    walkTimer: WALK_TIMER_MS, runFrame: 0 as 0 | 1,
    gx: 0,
    cacti: [] as Cactus[],
    nextCactus: randInt(CACTUS_MIN_MS, CACTUS_MAX_MS),
    score: 0, gameSpeed: SPEED_START,
  })

  const [phase, setPhase] = useState<Phase>('idle')
  const [finalScore, setFinalScore] = useState(0)
  const [best, setBest] = useState(0)
  const [members, setMembers] = useState<string[]>([])
  const [nameQuery, setNameQuery] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [scores, setScores] = useState<ScoreEntry[]>([])
  const [scoresLoading, setScoresLoading] = useState(true)

  const fetchScores = useCallback(async () => {
    setScoresLoading(true)
    const { data } = await supabase
      .from('game_scores').select('member_name, score')
      .eq('game_type', 'dino')
      .order('score', { ascending: false }).limit(200)
    const bestMap = new Map<string, number>()
    for (const row of (data ?? [])) {
      const prev = bestMap.get(row.member_name) ?? 0
      if (row.score > prev) bestMap.set(row.member_name, row.score)
    }
    setScores([...bestMap.entries()]
      .sort(([, a], [, b]) => b - a).slice(0, 10)
      .map(([name, score]) => ({ member_name: name, score })))
    setScoresLoading(false)
  }, [])

  // --- Render ---
  const render = useCallback(() => {
    const canvas = cvs.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const s = gs.current
    const im = imgs.current

    ctx.clearRect(0, 0, W, H)

    if (im) {
      // Scrolling ground (two copies for seamless tile)
      ctx.drawImage(im.ground, s.gx, GND_Y, GND_W, GND_H)
      ctx.drawImage(im.ground, s.gx + GND_W, GND_Y, GND_W, GND_H)
      // Cacti
      s.cacti.forEach(c => ctx.drawImage(im.cactus[c.type], c.x, c.y, c.w, c.h))
      // Player — stand still while jumping, animate legs while running
      const pImg = (s.jumpInProgress || phaseRef.current !== 'playing') ? im.stand : im.run[s.runFrame]
      ctx.drawImage(pImg, PX, s.py, PW, PH)
    } else {
      // 스프라이트 로딩 중 — 빈 캔버스 유지
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(0, GND_Y); ctx.lineTo(W, GND_Y); ctx.stroke()
    }

    // Score (centre)
    if (s.score > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.font = '13px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(String(Math.floor(s.score)).padStart(5, '0'), W / 2, 20)
      ctx.textAlign = 'left'
    }
  }, [])

  // --- Game loop (delta-time based, from reference) ---
  const loop = useCallback((t: number) => {
    if (phaseRef.current !== 'playing') return

    if (prevT.current === null) {
      prevT.current = t
      raf.current = requestAnimationFrame(loop)
      return
    }
    const dt = Math.min(t - prevT.current, 50)  // cap to prevent huge jumps on tab switch
    prevT.current = t
    const s = gs.current

    // Speed & score
    s.gameSpeed += dt * SPEED_INC
    s.score += dt * 0.005

    // Ground scroll
    s.gx -= s.gameSpeed * dt * CACTUS_SPD
    if (s.gx < -GND_W) s.gx = 0

    // Cactus spawn (random interval, 3 types)
    s.nextCactus -= dt
    if (s.nextCactus <= 0) {
      const type = randInt(0, 2) as 0 | 1 | 2
      const def = CACTI_DEF[type]
      s.cacti.push({ x: W * 1.5, y: GND_Y - def.h, w: def.w, h: def.h, type })
      s.nextCactus = randInt(CACTUS_MIN_MS, CACTUS_MAX_MS)
    }
    for (const c of s.cacti) c.x -= s.gameSpeed * dt * CACTUS_SPD
    s.cacti = s.cacti.filter(c => c.x > -c.w)

    // Run animation
    s.walkTimer -= dt * s.gameSpeed
    if (s.walkTimer <= 0) {
      s.runFrame = s.runFrame === 0 ? 1 : 0
      s.walkTimer = WALK_TIMER_MS
    }

    // Jump physics — velocity based (natural arc)
    if (s.jumpPressed && s.grounded) {
      s.vy = -JUMP_V
      s.grounded = false
      s.jumpInProgress = true
      s.jumpPressed = false
    }

    s.vy += GRAV_ACC * dt
    s.py += s.vy * dt

    if (s.py >= STAND_Y) {
      s.py = STAND_Y
      s.vy = 0
      s.grounded = true
      s.jumpInProgress = false
    }

    // Collision (forgiving hitbox)
    const hx = PX + 5, hy = s.py + 5, hw = PW - 10, hh = PH - 7
    for (const c of s.cacti) {
      if (hx + hw > c.x + 3 && hx < c.x + c.w - 3 && hy + hh > c.y + 3) {
        const score = Math.floor(s.score)
        setFinalScore(score)
        setBest(prev => Math.max(prev, score))
        phaseRef.current = 'gameover'
        setPhase('gameover')
        render()
        return
      }
    }

    render()
    raf.current = requestAnimationFrame(loop)
  }, [render])

  const pressJump = useCallback(() => { gs.current.jumpPressed = true }, [])
  const releaseJump = useCallback(() => { gs.current.jumpPressed = false }, [])

  const resetGame = useCallback(() => {
    const s = gs.current
    Object.assign(s, {
      py: STAND_Y, vy: 0,
      grounded: true, jumpPressed: false, jumpInProgress: false,
      walkTimer: WALK_TIMER_MS, runFrame: 0,
      gx: 0, cacti: [],
      nextCactus: randInt(CACTUS_MIN_MS, CACTUS_MAX_MS),
      score: 0, gameSpeed: SPEED_START,
    })
  }, [])

  const startGame = useCallback(() => {
    cancelAnimationFrame(raf.current)
    prevT.current = null
    resetGame()
    phaseRef.current = 'playing'
    setPhase('playing')
    setNameQuery(''); setSelectedName('')
    raf.current = requestAnimationFrame(loop)
  }, [loop, resetGame])

  const goIdle = useCallback(() => {
    cancelAnimationFrame(raf.current)
    resetGame()
    phaseRef.current = 'idle'
    setPhase('idle')
    setNameQuery(''); setSelectedName('')
    render()
  }, [render, resetGame])

  const handleDown = useCallback(() => {
    const p = phaseRef.current
    if (p === 'idle') startGame()
    else if (p === 'playing') pressJump()
  }, [startGame, pressJump])

  // Image loading
  useEffect(() => {
    const load = (src: string) => Object.assign(new Image(), { src }) as HTMLImageElement
    const run1 = load('/dino/dino_run1.png')
    const run2 = load('/dino/dino_run2.png')
    const stand = load('/dino/standing_still.png')
    const c1 = load('/dino/cactus_1.png')
    const c2 = load('/dino/cactus_2.png')
    const c3 = load('/dino/cactus_3.png')
    const ground = load('/dino/ground.png')
    const all = [run1, run2, stand, c1, c2, c3, ground]
    let n = 0
    const onLoad = () => {
      if (++n === all.length) {
        imgs.current = { run: [run1, run2], stand, cactus: [c1, c2, c3], ground }
        render()
      }
    }
    all.forEach(img => img.addEventListener('load', onLoad))
    render()
    return () => all.forEach(img => img.removeEventListener('load', onLoad))
  }, [render])

  // Keyboard input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'ArrowUp') return
      e.preventDefault()
      handleDown()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') releaseJump()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      cancelAnimationFrame(raf.current)
    }
  }, [handleDown, releaseJump])

  // Data fetching
  useEffect(() => {
    supabase.from('members').select('name').order('name').then(({ data }) => {
      setMembers((data ?? []).map((m: { name: string }) => m.name))
    })
    fetchScores()
  }, [fetchScores])

  async function submitScore() {
    if (!selectedName || submitting) return
    setSubmitting(true)
    const score = Math.floor(finalScore)
    if (score < 0 || score > 9999) { setSubmitting(false); return }
    const { error } = await supabase
      .from('game_scores')
      .insert({ member_name: selectedName, score, game_type: 'dino' })
    if (error) {
      console.error('게임 점수 등록 실패:', error)
      alert(`등록 실패: ${error.message}`)
      setSubmitting(false)
      return
    }
    await fetchScores()
    setSubmitting(false)
    setSubmitted(true)
    setTimeout(() => { goIdle(); setSubmitted(false) }, 1400)
  }

  const filteredMembers = nameQuery.trim() && !selectedName
    ? members.filter(n => n.includes(nameQuery.trim())).slice(0, 6)
    : []
  const topScore = scores[0]?.score ?? 0
  const isNewRecord = finalScore > topScore && scores.length > 0

  return (
    <div className="w-full max-w-[600px] flex flex-col gap-4">
      {/* Canvas */}
      <div>
        <div
          onMouseDown={handleDown}
          onMouseUp={releaseJump}
          onTouchStart={e => { e.preventDefault(); handleDown() }}
          onTouchEnd={releaseJump}
          style={{ touchAction: 'none' }}
        >
          <canvas
            ref={cvs}
            width={W}
            height={H}
            className="w-full rounded-2xl bg-white/5 cursor-pointer border border-white/10"
          />
        </div>
        {phase === 'idle' && (
          <p
            className="text-center text-white/30 text-xs mt-2 select-none cursor-pointer"
            onMouseDown={handleDown}
          >
            스페이스바 또는 탭해서 시작
          </p>
        )}
      </div>

      {/* Game Over Panel */}
      {phase === 'gameover' && (
        <div className="relative z-10 bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-md">
          {submitted ? (
            <p className="text-center text-green-400 font-semibold py-3">등록 완료! ✓</p>
          ) : (
            <>
              <div className="text-center mb-4">
                <p className="text-3xl font-bold text-white tabular-nums">
                  {finalScore}<span className="text-white/40 text-base ml-1 font-normal">점</span>
                </p>
                {isNewRecord && <p className="text-yellow-400 text-sm mt-1">🏆 신기록!</p>}
                {best > 0 && !isNewRecord && <p className="text-white/30 text-xs mt-1">세션 최고 {best}점</p>}
              </div>
              <p className="text-white/35 text-xs text-center mb-3">이름을 검색해서 점수를 등록해봐요</p>
              <div className="relative">
                <input
                  type="text"
                  value={nameQuery}
                  onChange={e => { setNameQuery(e.target.value); setSelectedName('') }}
                  placeholder="이름 검색"
                  autoFocus
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:ring-1 focus:ring-white/30 text-sm"
                />
                {filteredMembers.length > 0 && (
                  <div className="absolute top-full mt-1 w-full bg-zinc-900 border border-white/15 rounded-xl overflow-hidden z-10 shadow-2xl">
                    {filteredMembers.map(name => (
                      <button
                        key={name}
                        onClick={() => { setSelectedName(name); setNameQuery(name) }}
                        className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={submitScore}
                  disabled={!selectedName || submitting}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-white/15 text-white hover:bg-white/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? '등록 중...' : '점수 등록'}
                </button>
                <button
                  onClick={goIdle}
                  className="px-5 py-2.5 rounded-xl text-sm text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
                >
                  다시 시작
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Leaderboard */}
      <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 backdrop-blur-md">
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-3">게임 랭킹</p>
        {scoresLoading ? (
          <p className="text-white/25 text-sm text-center py-3">불러오는 중...</p>
        ) : scores.length === 0 ? (
          <p className="text-white/25 text-sm text-center py-4">아직 기록이 없어요. 첫 번째 도전자가 되어보세요!</p>
        ) : (
          <div className="space-y-1">
            {scores.map((s, i) => (
              <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-xl ${i < 3 ? 'bg-white/8' : ''}`}>
                <div className="flex items-center gap-2.5">
                  <span className="text-sm w-5 text-center leading-none">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (
                      <span className="text-white/25 text-xs">{i + 1}</span>
                    )}
                  </span>
                  <span className="text-white/80 text-sm">{s.member_name}</span>
                </div>
                <span className="text-white/50 text-sm font-mono tabular-nums">{s.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
