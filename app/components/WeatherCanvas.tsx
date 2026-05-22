'use client'

import { useEffect, useRef } from 'react'

interface Props {
  pty: string
  sky: string
  lgt: string
}

function getKSTHour() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours()
}

export function WeatherCanvas({ pty, sky, lgt }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    let w = 0
    let h = 0

    function resize() {
      const rect = canvas!.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas!.width = w * dpr
      canvas!.height = h * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    // 조건 판단
    const thunder  = lgt === '1'
    const rain     = pty === '1' || pty === '2' || pty === '5' || pty === '6'
    const snow     = pty === '3' || pty === '7'
    const windSnow = pty === '7'
    const drizzle  = pty === '5'
    const clear    = pty === '0' && sky === '1'
    const partly   = pty === '0' && sky === '3'
    const overcast = !rain && !snow && !clear && !partly

    const hour    = getKSTHour()
    const isNight = hour >= 20 || hour < 6
    const isDusk  = hour >= 17 && hour < 20
    const isDawn  = hour >= 5  && hour < 7

    // ── 파티클 초기화 ──────────────────────────────────────────
    type RainDrop = { x: number; y: number; speed: number; len: number; op: number }
    type SnowFlake = { x: number; y: number; size: number; speed: number; phase: number; phaseSpd: number; op: number; rot: number; rotSpd: number }
    type StarP = { x: number; y: number; size: number; baseOp: number; twSpd: number; twOff: number }

    const drops: RainDrop[]   = []
    const flakes: SnowFlake[] = []
    const stars: StarP[]      = []

    const rainCount = thunder ? 220 : drizzle ? 70 : 150

    if (rain || thunder) {
      for (let i = 0; i < rainCount; i++) {
        drops.push({
          x:     Math.random() * 1.3 - 0.15,
          y:     Math.random(),
          speed: 0.009 + Math.random() * 0.007,
          len:   0.025 + Math.random() * 0.035,
          op:    0.25 + Math.random() * 0.45,
        })
      }
    }

    if (snow) {
      const count = windSnow ? 130 : 75
      for (let i = 0; i < count; i++) {
        flakes.push({
          x:        Math.random(),
          y:        Math.random(),
          size:     1.5 + Math.random() * 4,
          speed:    0.0006 + Math.random() * 0.0018,
          phase:    Math.random() * Math.PI * 2,
          phaseSpd: 0.008 + Math.random() * 0.018,
          op:       0.55 + Math.random() * 0.45,
          rot:      Math.random() * Math.PI * 2,
          rotSpd:   (Math.random() - 0.5) * 0.02,
        })
      }
    }

    if (isNight && (clear || partly)) {
      for (let i = 0; i < 180; i++) {
        stars.push({
          x:      Math.random(),
          y:      Math.random() * 0.65,
          size:   0.4 + Math.random() * 1.6,
          baseOp: 0.35 + Math.random() * 0.65,
          twSpd:  0.018 + Math.random() * 0.035,
          twOff:  Math.random() * Math.PI * 2,
        })
      }
    }

    // ── 구름 레이어 정의 ──────────────────────────────────────
    const cloudLayers = [
      { xNorm: 0.52, yNorm: 0.07, scale: 1.25, op: 0.88, spd: 0.000045, dark: rain || thunder },
      { xNorm: 0.18, yNorm: 0.17, scale: 0.85, op: 0.55, spd: 0.000028, dark: false },
      { xNorm: 0.82, yNorm: 0.11, scale: 0.70, op: 0.40, spd: 0.000065, dark: false },
    ]

    // ── 번개 상태 ──────────────────────────────────────────────
    let ltTimer    = 0
    let ltCooldown = 3 + Math.random() * 5
    let ltFlash    = 0
    type Bolt = { x1: number; y1: number; pts: [number, number][]; branches: [number, number, number, number][] }
    let bolts: Bolt[] = []

    function makeBolt(): Bolt {
      const x1 = (0.25 + Math.random() * 0.5) * w
      const y1 = 0
      const x2 = x1 + (Math.random() - 0.5) * w * 0.25
      const y2 = (0.35 + Math.random() * 0.3) * h
      const segs = 10
      const pts: [number, number][] = [[x1, y1]]
      for (let i = 1; i < segs; i++) {
        const t = i / segs
        pts.push([
          x1 + (x2 - x1) * t + (Math.random() - 0.5) * 50,
          y1 + (y2 - y1) * t + (Math.random() - 0.5) * 15,
        ])
      }
      pts.push([x2, y2])

      const branches: [number, number, number, number][] = []
      const numB = 1 + Math.floor(Math.random() * 3)
      for (let b = 0; b < numB; b++) {
        const ti = 3 + Math.floor(Math.random() * (segs - 4))
        const [bx, by] = pts[ti]
        branches.push([bx, by, bx + (Math.random() - 0.5) * 90, by + 50 + Math.random() * 90])
      }
      return { x1, y1, pts, branches }
    }

    function drawBoltPath(pts: [number, number][], lw: number, op: number) {
      ctx!.beginPath()
      ctx!.moveTo(pts[0][0], pts[0][1])
      for (let i = 1; i < pts.length; i++) ctx!.lineTo(pts[i][0], pts[i][1])
      ctx!.strokeStyle = `rgba(255,255,220,${op})`
      ctx!.lineWidth   = lw
      ctx!.shadowColor = 'rgba(180,210,255,0.9)'
      ctx!.shadowBlur  = 18
      ctx!.stroke()
      ctx!.shadowBlur  = 0
    }

    // ── 구름 그리기 ──────────────────────────────────────────
    function drawCloud(cx: number, cy: number, scale: number, op: number, dark: boolean) {
      const base = dark
        ? { r: 45, g: 58, b: 75 }
        : { r: 230, g: 235, b: 245 }

      const circles = [
        { dx:  0,   dy:  0,  r: 44 },
        { dx: -48,  dy: 16,  r: 33 },
        { dx:  50,  dy: 12,  r: 36 },
        { dx: -24,  dy: 30,  r: 28 },
        { dx:  26,  dy: 32,  r: 26 },
        { dx:   0,  dy: 40,  r: 46 },
      ]

      ctx!.save()
      ctx!.globalAlpha = op
      ctx!.fillStyle = `rgb(${base.r},${base.g},${base.b})`
      for (const c of circles) {
        ctx!.beginPath()
        ctx!.arc(cx + c.dx * scale, cy + c.dy * scale, c.r * scale, 0, Math.PI * 2)
        ctx!.fill()
      }
      ctx!.restore()
    }

    // ── 태양 ────────────────────────────────────────────────
    function drawSun(cx: number, cy: number, t: number, sz = 1) {
      // 대형 글로우
      const grd = ctx!.createRadialGradient(cx, cy, 0, cx, cy, 160 * sz)
      grd.addColorStop(0,   'rgba(255,210,60,0.28)')
      grd.addColorStop(0.4, 'rgba(255,170,20,0.10)')
      grd.addColorStop(1,   'rgba(255,140,0,0)')
      ctx!.beginPath()
      ctx!.arc(cx, cy, 160 * sz, 0, Math.PI * 2)
      ctx!.fillStyle = grd
      ctx!.fill()

      // 펄스 글로우
      const pulse = 0.88 + 0.12 * Math.sin(t * 0.022)
      const grd2 = ctx!.createRadialGradient(cx, cy, 0, cx, cy, 62 * sz * pulse)
      grd2.addColorStop(0, 'rgba(255,240,120,0.22)')
      grd2.addColorStop(1, 'rgba(255,200,50,0)')
      ctx!.beginPath()
      ctx!.arc(cx, cy, 62 * sz * pulse, 0, Math.PI * 2)
      ctx!.fillStyle = grd2
      ctx!.fill()

      // 광선 (테이퍼 형태)
      ctx!.save()
      ctx!.translate(cx, cy)
      ctx!.rotate(t * 0.0028)
      for (let i = 0; i < 8; i++) {
        const rayOp = 0.28 + 0.15 * Math.sin(t * 0.05 + i * 1.1)
        ctx!.fillStyle = `rgba(255,215,60,${rayOp})`
        ctx!.beginPath()
        const inner = 38 * sz
        const outer = 72 * sz
        ctx!.moveTo(-2 * sz, inner)
        ctx!.lineTo( 2 * sz, inner)
        ctx!.lineTo( 0.8 * sz, outer)
        ctx!.lineTo(-0.8 * sz, outer)
        ctx!.fill()
        ctx!.rotate(Math.PI / 4)
      }
      ctx!.restore()

      // 태양 코어
      const core = ctx!.createRadialGradient(cx - 8 * sz, cy - 8 * sz, 0, cx, cy, 30 * sz)
      core.addColorStop(0, '#FFFBC0')
      core.addColorStop(0.45, '#FFD700')
      core.addColorStop(1,  '#FFA520')
      ctx!.beginPath()
      ctx!.arc(cx, cy, 30 * sz, 0, Math.PI * 2)
      ctx!.fillStyle = core
      ctx!.fill()
    }

    // ── 달 ──────────────────────────────────────────────────
    function drawMoon(cx: number, cy: number) {
      // 글로우
      const grd = ctx!.createRadialGradient(cx, cy, 18, cx, cy, 75)
      grd.addColorStop(0, 'rgba(255,250,220,0.18)')
      grd.addColorStop(1, 'rgba(255,250,220,0)')
      ctx!.beginPath()
      ctx!.arc(cx, cy, 75, 0, Math.PI * 2)
      ctx!.fillStyle = grd
      ctx!.fill()

      // 달 본체
      ctx!.beginPath()
      ctx!.arc(cx, cy, 26, 0, Math.PI * 2)
      ctx!.fillStyle = '#F5F0D5'
      ctx!.fill()

      // 초승달 그림자 (배경색으로 덮어서 crescent 표현)
      ctx!.save()
      ctx!.globalCompositeOperation = 'destination-out'
      ctx!.beginPath()
      ctx!.arc(cx + 11, cy - 5, 22, 0, Math.PI * 2)
      ctx!.fill()
      ctx!.restore()
    }

    // ── 애니메이션 루프 ─────────────────────────────────────
    let t = 0
    let animId: number

    function animate() {
      t++
      ctx!.clearRect(0, 0, w, h)

      // ── 별 ──
      if (isNight && (clear || partly) && stars.length > 0) {
        for (const s of stars) {
          const op = s.baseOp * (0.65 + 0.35 * Math.sin(t * s.twSpd + s.twOff))
          ctx!.beginPath()
          ctx!.arc(s.x * w, s.y * h, s.size, 0, Math.PI * 2)
          ctx!.fillStyle = `rgba(255,255,255,${op})`
          ctx!.fill()
        }
      }

      // ── 태양 / 달 ──
      if (!rain && !thunder) {
        if (isNight && (clear || partly)) {
          drawMoon(w * 0.72, h * 0.10)
        } else if (clear) {
          drawSun(w * 0.5, h * 0.10, t)
        } else if (partly) {
          ctx!.save()
          ctx!.globalAlpha = 0.72
          drawSun(w * 0.2, h * 0.09, t, 0.72)
          ctx!.restore()
        } else if (isDusk || isDawn) {
          // 석양/새벽 — 지평선 근처 흐릿한 태양
          ctx!.save()
          ctx!.globalAlpha = 0.45
          drawSun(w * 0.5, h * 0.18, t, 0.8)
          ctx!.restore()
        }
      }

      // ── 구름 ──
      const hasClouds = rain || thunder || snow || partly || overcast
      if (hasClouds) {
        const numClouds = overcast ? 3 : 1
        for (let ci = 0; ci < numClouds; ci++) {
          const cl = cloudLayers[ci]
          const cx = ((cl.xNorm + t * cl.spd) % 1.35 - 0.18) * w
          const cy = cl.yNorm * h
          drawCloud(cx, cy, cl.scale, cl.op, cl.dark || (thunder && ci > 0))
        }
      }

      // ── 번개 플래시 ──
      if (thunder && ltFlash > 0) {
        ctx!.fillStyle = `rgba(200,220,255,${ltFlash * 0.22})`
        ctx!.fillRect(0, 0, w, h)
        for (const bolt of bolts) {
          drawBoltPath(bolt.pts, 2.5, ltFlash * 0.92)
          for (const [x1, y1, x2, y2] of bolt.branches) {
            const bpts: [number, number][] = [[x1, y1]]
            const bsegs = 5
            for (let s = 1; s < bsegs; s++) {
              const tb = s / bsegs
              bpts.push([
                x1 + (x2 - x1) * tb + (Math.random() - 0.5) * 25,
                y1 + (y2 - y1) * tb + (Math.random() - 0.5) * 10,
              ])
            }
            bpts.push([x2, y2])
            drawBoltPath(bpts, 1.2, ltFlash * 0.75)
          }
        }
        ltFlash = Math.max(0, ltFlash - 0.072)
      }

      // ── 번개 타이머 ──
      if (thunder) {
        ltTimer += 1 / 60
        if (ltTimer >= ltCooldown) {
          ltTimer    = 0
          ltCooldown = 3 + Math.random() * 7
          bolts      = [makeBolt()]
          ltFlash    = 1.0
          // 두 번째 깜빡임
          setTimeout(() => { ltFlash = 0.65 }, 90)
        }
      }

      // ── 빗줄기 ──
      if ((rain || thunder) && drops.length > 0) {
        const windSin = thunder ? Math.sin(0.18) : Math.sin(0.11)
        const windCos = thunder ? Math.cos(0.18) : Math.cos(0.11)
        ctx!.save()
        ctx!.lineWidth = 1
        for (const d of drops) {
          d.y += d.speed
          d.x += windSin * d.speed * 0.4
          if (d.y > 1 + d.len) { d.y = -d.len; d.x = Math.random() * 1.3 - 0.15 }

          ctx!.globalAlpha = d.op
          ctx!.strokeStyle = 'rgba(180,218,255,1)'
          ctx!.beginPath()
          ctx!.moveTo(d.x * w, d.y * h)
          ctx!.lineTo(d.x * w + windSin * d.len * h * 0.38, (d.y + d.len * windCos) * h)
          ctx!.stroke()
        }
        ctx!.restore()
      }

      // ── 눈송이 ──
      if (snow && flakes.length > 0) {
        const windDrift = windSnow ? 0.0028 : 0
        ctx!.save()
        ctx!.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx!.lineWidth = 0.9
        for (const f of flakes) {
          f.phase += f.phaseSpd
          f.y     += f.speed
          f.x     += Math.sin(f.phase) * 0.0025 + windDrift
          f.rot   += f.rotSpd
          if (f.y > 1 + f.size / h) { f.y = -f.size / h; f.x = Math.random() }
          if (f.x > 1.05) f.x = -0.05
          if (f.x < -0.05) f.x = 1.05

          ctx!.save()
          ctx!.globalAlpha = f.op
          ctx!.translate(f.x * w, f.y * h)
          ctx!.rotate(f.rot)
          for (let arm = 0; arm < 6; arm++) {
            ctx!.beginPath()
            ctx!.moveTo(0, 0)
            ctx!.lineTo(0, f.size)
            ctx!.stroke()
            ctx!.rotate(Math.PI / 3)
          }
          ctx!.restore()
        }
        ctx!.restore()
      }

      animId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animId)
      ro.disconnect()
    }
  }, [pty, sky, lgt])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  )
}
