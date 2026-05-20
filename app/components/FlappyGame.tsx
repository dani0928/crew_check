'use client'

// Ported from github.com/noanonoa/flappy-bird
// Sprites: spriters-resource.com/fullview/59894/

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// --- Constants (faithful to original) ---
const W = 300, H = 500
const GROUND_H = 112
const GROUND_Y = H - GROUND_H        // 388
const BG_H = 228
const BG_Y = H - BG_H                // 272
const BG_W = 276
const GND_IMG_W = 224

const GRAVITY = 0.32
const FLY_V = 5.25
const BIRD_W = 34, BIRD_H = 24, BIRD_R = 12
const BIRD_X = 50

const PIPE_W = 55, PIPE_H = 300, PIPE_GAP = 85, PIPE_DX = 2
const PIPE_MIN_Y = -260, PIPE_MAX_Y = -40
const SPAWN_EVERY = 100              // frames

const DEG = Math.PI / 180

// Yellow bird animation frames (from theme1)
const BIRD_ANIM = [
  { imgX: 276, imgY: 114 },
  { imgX: 276, imgY: 140 },
  { imgX: 276, imgY: 166 },
  { imgX: 276, imgY: 140 },
]

// Score digit positions (from theme2)
const DIGITS = [
  { imgX: 496, imgY: 60,  w: 12, h: 18 }, // 0
  { imgX: 135, imgY: 455, w: 10, h: 18 }, // 1
  { imgX: 292, imgY: 160, w: 12, h: 18 }, // 2
  { imgX: 306, imgY: 160, w: 12, h: 18 }, // 3
  { imgX: 320, imgY: 160, w: 12, h: 18 }, // 4
  { imgX: 334, imgY: 160, w: 12, h: 18 }, // 5
  { imgX: 292, imgY: 184, w: 12, h: 18 }, // 6
  { imgX: 306, imgY: 184, w: 12, h: 18 }, // 7
  { imgX: 320, imgY: 184, w: 12, h: 18 }, // 8
  { imgX: 334, imgY: 184, w: 12, h: 18 }, // 9
]

type Phase = 'getReady' | 'playing' | 'gameOver'
interface ScoreEntry { member_name: string; score: number }

function randPipeY() {
  return Math.floor(Math.random() * (PIPE_MAX_Y - PIPE_MIN_Y + 1)) + PIPE_MIN_Y
}

export function FlappyGame() {
  const cvs = useRef<HTMLCanvasElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const imgs = useRef<{ t1: HTMLImageElement; t2: HTMLImageElement } | null>(null)

  // All game state in one ref (no re-renders inside loop)
  const gs = useRef({
    phase: 0 as 0 | 1 | 2,   // 0=getReady 1=play 2=gameOver
    frame: 0,
    birdY: 160, birdVY: 0, birdFr: 0, birdRot: 0,
    bgX: 0, groundX: 0,
    pipes: [] as { x: number; y: number }[],
    score: 0,
    gameOverFired: false,
  })

  // UI state
  const [uiPhase, setUiPhase] = useState<Phase>('getReady')
  const [finalScore, setFinalScore] = useState(0)
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
      .eq('game_type', 'flappy')
      .order('score', { ascending: false }).limit(200)
    const best = new Map<string, number>()
    for (const r of (data ?? []))
      if (r.score > (best.get(r.member_name) ?? 0)) best.set(r.member_name, r.score)
    setScores([...best.entries()].sort(([, a], [, b]) => b - a).slice(0, 10)
      .map(([name, score]) => ({ member_name: name, score })))
    setScoresLoading(false)
  }, [])

  // --- Render ---
  const render = useCallback(() => {
    const canvas = cvs.current
    const im = imgs.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const s = gs.current

    // Sky
    ctx.fillStyle = '#00bbc4'
    ctx.fillRect(0, 0, W, H)

    if (im) {
      // Background (3 tiles for seamless scroll)
      ctx.drawImage(im.t1, 0, 0, BG_W, BG_H, s.bgX, BG_Y, BG_W, BG_H)
      ctx.drawImage(im.t1, 0, 0, BG_W, BG_H, s.bgX + BG_W, BG_Y, BG_W, BG_H)
      ctx.drawImage(im.t1, 0, 0, BG_W, BG_H, s.bgX + BG_W * 2, BG_Y, BG_W, BG_H)

      // Pipes (top + bottom)
      for (const pipe of s.pipes) {
        ctx.drawImage(im.t2, 56, 323, 26, 160, pipe.x, pipe.y, PIPE_W, PIPE_H)
        ctx.drawImage(im.t2, 84, 323, 26, 160, pipe.x, pipe.y + PIPE_H + PIPE_GAP, PIPE_W, PIPE_H)
      }

      // Ground (2 tiles)
      ctx.drawImage(im.t1, 276, 0, GND_IMG_W, GROUND_H, s.groundX, GROUND_Y, GND_IMG_W, GROUND_H)
      ctx.drawImage(im.t1, 276, 0, GND_IMG_W, GROUND_H, s.groundX + GND_IMG_W, GROUND_Y, GND_IMG_W, GROUND_H)

      // Score
      if (s.phase >= 1) drawScore(ctx, im.t2, s.score)

      // Bird (with rotation)
      const bf = BIRD_ANIM[s.birdFr]
      ctx.save()
      ctx.translate(BIRD_X, s.birdY)
      ctx.rotate(s.birdRot)
      ctx.drawImage(im.t1, bf.imgX, bf.imgY, BIRD_W, BIRD_H, -BIRD_W / 2, -BIRD_H / 2, BIRD_W, BIRD_H)
      ctx.restore()

      // GetReady overlay
      if (s.phase === 0)
        ctx.drawImage(im.t1, 0, 228, 174, 160, W / 2 - 87, H / 2 - 160, 174, 160)

      // GameOver overlay
      if (s.phase === 2)
        ctx.drawImage(im.t1, 174, 228, 226, 158, W / 2 - 113, H / 2 - 160, 226, 158)
    }
  }, [])

  function drawScore(ctx: CanvasRenderingContext2D, t2: HTMLImageElement, score: number) {
    const cx = W / 2, y = 40, dw = 15, dh = 25
    const str = score.toString()
    const d = (i: number) => parseInt(str.charAt(str.length - 1 - i)) || 0

    if (score >= 100) {
      const [ones, tens, huns] = [d(0), d(1), d(2)]
      ctx.drawImage(t2, DIGITS[huns].imgX, DIGITS[huns].imgY, DIGITS[huns].w, DIGITS[huns].h, cx - dw / 2 - dw - 3, y, dw, dh)
      ctx.drawImage(t2, DIGITS[tens].imgX, DIGITS[tens].imgY, DIGITS[tens].w, DIGITS[tens].h, cx - dw / 2, y, dw, dh)
      ctx.drawImage(t2, DIGITS[ones].imgX, DIGITS[ones].imgY, DIGITS[ones].w, DIGITS[ones].h, cx - dw / 2 + dw + 3, y, dw, dh)
    } else if (score >= 10) {
      const [ones, tens] = [d(0), d(1)]
      ctx.drawImage(t2, DIGITS[tens].imgX, DIGITS[tens].imgY, DIGITS[tens].w, DIGITS[tens].h, cx - dw / 2 - dw / 2 - 3, y, dw, dh)
      ctx.drawImage(t2, DIGITS[ones].imgX, DIGITS[ones].imgY, DIGITS[ones].w, DIGITS[ones].h, cx - dw / 2 + dw / 2 + 3, y, dw, dh)
    } else {
      const ones = d(0)
      ctx.drawImage(t2, DIGITS[ones].imgX, DIGITS[ones].imgY, DIGITS[ones].w, DIGITS[ones].h, cx - dw / 2, y, dw, dh)
    }
  }

  // --- Update ---
  const update = useCallback(() => {
    const s = gs.current
    s.frame++

    if (s.phase === 0) {
      // GetReady: bird bobs in place
      s.bgX = 0; s.groundX = 0; s.birdY = 160; s.birdRot = 0
      if (s.frame % 20 === 0) s.birdFr = (s.birdFr + 1) % BIRD_ANIM.length

    } else if (s.phase === 1) {
      // Playing
      s.bgX = (s.bgX - 0.2) % BG_W
      s.groundX = (s.groundX - PIPE_DX) % (GND_IMG_W / 2)

      // Bird animation
      if (s.frame % 4 === 0) s.birdFr = (s.birdFr + 1) % BIRD_ANIM.length

      // Physics
      s.birdVY += GRAVITY
      s.birdY += s.birdVY

      // Rotation
      if (s.birdVY <= -FLY_V) { s.birdRot = -15 * DEG }
      else if (s.birdVY >= FLY_V + 2) { s.birdRot = 70 * DEG; s.birdFr = 1 }
      else { s.birdRot = 0 }

      // Ceiling
      if (s.birdY - BIRD_H / 2 <= 0) s.birdY = BIRD_R

      // Ground collision
      if (s.birdY + BIRD_H / 2 >= GROUND_Y) {
        s.birdY = GROUND_Y - BIRD_H / 2
        s.birdRot = 70 * DEG
        triggerGameOver(s.score)
        s.phase = 2
        return
      }

      // Spawn pipes
      if (s.frame % SPAWN_EVERY === 0)
        s.pipes.push({ x: W, y: randPipeY() })

      // Move pipes, score, collision
      const b = { l: BIRD_X - BIRD_R, r: BIRD_X + BIRD_R, t: s.birdY - BIRD_R, b: s.birdY + BIRD_R }
      const keep: typeof s.pipes = []

      for (const pipe of s.pipes) {
        pipe.x -= PIPE_DX

        // Pipe exited → score
        if (pipe.x < -PIPE_W) {
          s.score = Math.min(s.score + 1, 999)
          if (s.score >= 999) { triggerGameOver(s.score); s.phase = 2; s.pipes = keep; return }
          continue
        }

        keep.push(pipe)

        // Collision: top pipe
        const tpBot = pipe.y + PIPE_H
        if (b.l < pipe.x + PIPE_W && b.r > pipe.x && b.t < tpBot && b.b > pipe.y) {
          triggerGameOver(s.score); s.phase = 2; s.pipes = keep; return
        }
        // Collision: bottom pipe
        const bpTop = pipe.y + PIPE_H + PIPE_GAP
        if (b.l < pipe.x + PIPE_W && b.r > pipe.x && b.t < bpTop + PIPE_H && b.b > bpTop) {
          triggerGameOver(s.score); s.phase = 2; s.pipes = keep; return
        }
      }
      s.pipes = keep

    } else {
      // GameOver: bird falls and stays on ground
      if (s.birdY + BIRD_H / 2 < GROUND_Y) {
        s.birdVY += GRAVITY
        s.birdY += s.birdVY
        if (s.birdY + BIRD_H / 2 >= GROUND_Y) s.birdY = GROUND_Y - BIRD_H / 2
      }
    }
  }, []) // eslint-disable-line

  function triggerGameOver(score: number) {
    const s = gs.current
    if (s.gameOverFired) return
    s.gameOverFired = true
    setFinalScore(score)
    setUiPhase('gameOver')
  }

  const loop = useCallback(() => { render(); update() }, [render, update])

  // --- Input ---
  const flap = useCallback(() => {
    const s = gs.current
    if (s.phase === 0) { s.phase = 1; setUiPhase('playing') }
    if (s.phase === 1) s.birdVY = -FLY_V
  }, [])

  const restart = useCallback(() => {
    const s = gs.current
    Object.assign(s, {
      phase: 0, frame: 0,
      birdY: 160, birdVY: 0, birdFr: 0, birdRot: 0,
      bgX: 0, groundX: 0, pipes: [], score: 0, gameOverFired: false,
    })
    setUiPhase('getReady')
    setNameQuery(''); setSelectedName('')
  }, [])

  const handleAction = useCallback(() => {
    const s = gs.current
    if (s.phase === 2) { restart(); return }
    flap()
  }, [flap, restart])

  // --- Init ---
  useEffect(() => {
    const t1 = Object.assign(new Image(), { src: '/flappy/og-theme.png' }) as HTMLImageElement
    const t2 = Object.assign(new Image(), { src: '/flappy/og-theme-2.png' }) as HTMLImageElement
    let n = 0
    const onLoad = () => { if (++n === 2) imgs.current = { t1, t2 } }
    t1.addEventListener('load', onLoad)
    t2.addEventListener('load', onLoad)

    timerRef.current = setInterval(loop, 17)

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); handleAction() }
    }
    window.addEventListener('keydown', onKey)

    supabase.from('members').select('name').order('name').then(({ data }) =>
      setMembers((data ?? []).map((m: { name: string }) => m.name))
    )
    fetchScores()

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      window.removeEventListener('keydown', onKey)
    }
  }, [loop, handleAction, fetchScores])

  // --- Score submit ---
  async function handleSubmitScore() {
    if (!selectedName || submitting) return
    setSubmitting(true)
    if (finalScore < 0 || finalScore > 9999) { setSubmitting(false); return }
    const { error } = await supabase
      .from('game_scores')
      .insert({ member_name: selectedName, score: finalScore, game_type: 'flappy' })
    if (error) { alert(`등록 실패: ${error.message}`); setSubmitting(false); return }
    await fetchScores()
    setSubmitting(false)
    setSubmitted(true)
    setTimeout(() => { restart(); setSubmitted(false) }, 1400)
  }

  const filteredMembers = nameQuery.trim() && !selectedName
    ? members.filter(n => n.includes(nameQuery.trim())).slice(0, 6) : []
  const topScore = scores[0]?.score ?? 0
  const isNewRecord = finalScore > topScore && scores.length > 0

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Canvas */}
      <div
        onPointerDown={e => { e.preventDefault(); handleAction() }}
        style={{ width: W, maxWidth: '100%', touchAction: 'none' }}
      >
        <canvas
          ref={cvs}
          width={W} height={H}
          className="w-full rounded-2xl cursor-pointer border border-white/10"
        />
      </div>

      {/* Game Over Panel */}
      {uiPhase === 'gameOver' && (
        <div className="relative z-10 w-full max-w-[300px] bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-md">
          {submitted ? (
            <p className="text-center text-green-400 font-semibold py-3">등록 완료! ✓</p>
          ) : (
            <>
              <div className="text-center mb-4">
                <p className="text-3xl font-bold text-white tabular-nums">
                  {finalScore}<span className="text-white/40 text-base ml-1 font-normal">점</span>
                </p>
                {isNewRecord && <p className="text-yellow-400 text-sm mt-1">🏆 신기록!</p>}
              </div>
              <p className="text-white/35 text-xs text-center mb-3">이름을 검색해서 점수를 등록해봐요</p>
              <div className="relative">
                <input type="text" value={nameQuery}
                  onChange={e => { setNameQuery(e.target.value); setSelectedName('') }}
                  placeholder="이름 검색" autoFocus
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:ring-1 focus:ring-white/30 text-sm" />
                {filteredMembers.length > 0 && (
                  <div className="absolute top-full mt-1 w-full bg-zinc-900 border border-white/15 rounded-xl overflow-hidden z-10 shadow-2xl">
                    {filteredMembers.map(name => (
                      <button key={name} onClick={() => { setSelectedName(name); setNameQuery(name) }}
                        className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors">
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={handleSubmitScore} disabled={!selectedName || submitting}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-white/15 text-white hover:bg-white/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  {submitting ? '등록 중...' : '점수 등록'}
                </button>
                <button onClick={restart}
                  className="px-5 py-2.5 rounded-xl text-sm text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors">
                  다시 시작
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Leaderboard */}
      <div className="w-full max-w-[300px] bg-white/5 border border-white/10 rounded-2xl px-5 py-4 backdrop-blur-md">
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-3">🐦 플래피버드 랭킹</p>
        {scoresLoading ? (
          <p className="text-white/25 text-sm text-center py-3">불러오는 중...</p>
        ) : scores.length === 0 ? (
          <p className="text-white/25 text-sm text-center py-4">아직 기록이 없어요!</p>
        ) : (
          <div className="space-y-1">
            {scores.map((s, i) => (
              <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-xl ${i < 3 ? 'bg-white/8' : ''}`}>
                <div className="flex items-center gap-2.5">
                  <span className="text-sm w-5 text-center">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-white/25 text-xs">{i + 1}</span>}
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
