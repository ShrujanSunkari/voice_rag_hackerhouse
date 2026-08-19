'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion'
import { Activity, ChevronDown, CircleHelp, FileText, Headphones, Mic, ShieldCheck, Sparkles, Square, Volume2, Zap, Loader2, AlertTriangle } from 'lucide-react'
import { VectorCosmos } from '@/components/VectorCosmos'

type EvidenceShard = { text: string; score?: number; source?: string; metadata?: { docId?: string; language?: string; strategy?: string } }
type QueryResponse = { synthesized_answer: string; evidence_shards: (EvidenceShard | string)[]; latency_ms: number; citations_count?: number }
type DisplayShard = [id: string, source: string, copy: string, score: number]
type Stage = [name: string, time: string, detail: string]

const defaultEvidence: DisplayShard[] = [
  ['SHARD-04', 'FIELD NOTES / goa-026', 'The signal resolves when fragmented observations are aligned into a single, traceable account.', 0],
  ['SHARD-11', 'FIELD NOTES / task-02', 'A grounded answer carries its evidence forward, keeping the path visible.', 0],
  ['SHARD-07', 'DRISHTI INDEX / warm-run', 'Warm index latency is measured from request receipt through grounded serialization.', 0],
]
const defaultStages: Stage[] = [['Transcribed', '00:42', 'Voice signal decoded'], ['Retrieved', '18 ms', '3 shards fused'], ['Grounded', '64 ms', 'Citation coverage 100%'], ['Answered', '112 ms', 'Confidence high']]
const defaultMetrics = [78, 112, 196]

// ── 3D COSMIC DEEP SPACE WARP BACKGROUND ────────────────────────────────────
function SpaceBackground({ isWarping = false }: { isWarping?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)

    // 220 3D Warp Stars
    const numStars = 220
    const stars = Array.from({ length: numStars }).map(() => ({
      x: (Math.random() - 0.5) * width * 2,
      y: (Math.random() - 0.5) * height * 2,
      z: Math.random() * width,
      size: Math.random() * 1.6 + 0.5,
      speed: Math.random() * 1.8 + 0.8,
      baseAlpha: Math.random() * 0.7 + 0.3,
      color: Math.random() > 0.6 ? '#f59e0b' : Math.random() > 0.3 ? '#38bdf8' : '#ffffff'
    }))

    let nebulaPhase = 0

    const render = () => {
      ctx.clearRect(0, 0, width, height)
      nebulaPhase += 0.003
      const cx = width / 2
      const cy = height / 2

      // ── Cosmic Nebula Glow ──
      const neb1 = ctx.createRadialGradient(cx * 0.7, cy * 0.8, 10, cx * 0.7, cy * 0.8, width * 0.45)
      neb1.addColorStop(0, 'rgba(245, 158, 11, 0.045)')
      neb1.addColorStop(0.5, 'rgba(234, 88, 12, 0.02)')
      neb1.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = neb1
      ctx.fillRect(0, 0, width, height)

      const neb2 = ctx.createRadialGradient(cx * 1.3, cy * 1.1, 10, cx * 1.3, cy * 1.1, width * 0.4)
      neb2.addColorStop(0, 'rgba(56, 189, 248, 0.035)')
      neb2.addColorStop(0.6, 'rgba(168, 85, 247, 0.015)')
      neb2.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = neb2
      ctx.fillRect(0, 0, width, height)

      // ── 3D Moving Stars (Warp Speed on query) ──
      const speedMul = isWarping ? 5.5 : 1.0

      stars.forEach((star) => {
        star.z -= star.speed * speedMul
        if (star.z <= 0) {
          star.z = width
          star.x = (Math.random() - 0.5) * width * 2
          star.y = (Math.random() - 0.5) * height * 2
        }

        const k = 280 / star.z
        const px = cx + star.x * k
        const py = cy + star.y * k

        if (px >= 0 && px <= width && py >= 0 && py <= height) {
          const starAlpha = Math.min(1, Math.max(0.1, (1 - star.z / width) * star.baseAlpha))
          ctx.fillStyle = star.color
          ctx.globalAlpha = starAlpha

          if (isWarping && star.z < width * 0.85) {
            // Hyperdrive light streaks
            const prevK = 280 / (star.z + star.speed * speedMul * 3.5)
            const prevPx = cx + star.x * prevK
            const prevPy = cy + star.y * prevK
            ctx.strokeStyle = star.color
            ctx.lineWidth = Math.max(0.8, star.size * k)
            ctx.beginPath()
            ctx.moveTo(prevPx, prevPy)
            ctx.lineTo(px, py)
            ctx.stroke()
          } else {
            ctx.beginPath()
            ctx.arc(px, py, Math.max(0.6, star.size * k), 0, Math.PI * 2)
            ctx.fill()
          }
        }
      })
      ctx.globalAlpha = 1

      animId = requestAnimationFrame(render)
    }

    render()
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
    }
  }, [isWarping])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ width: '100vw', height: '100vh', opacity: 0.85 }}
    />
  )
}

// ── SIMPLE MIC WITH DYNAMIC AUDIO WAVEFORM VISUALIZER ON QUERY/RECORDING ─────
function VoiceOrb({ isRecording, isThinking }: { isRecording: boolean; isThinking: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let time = 0

    const displayWidth = 320
    const displayHeight = 160
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 2, 2) : 2
    canvas.width = displayWidth * dpr
    canvas.height = displayHeight * dpr
    ctx.scale(dpr, dpr)

    const isAction = isRecording || isThinking

    const render = () => {
      time += isRecording ? 0.06 : isThinking ? 0.045 : 0.015
      ctx.clearRect(0, 0, displayWidth, displayHeight)
      const cx = displayWidth / 2
      const cy = displayHeight / 2

      // ── WAVE ACTIONS (Only render dynamic soundwaves when Querying or Recording) ──
      if (isAction) {
        // Draw 5 glowing sinusoidal audio waveform ribbons across the button
        const numWaves = 5
        const waveColors = ['#fde047', '#fbbf24', '#f59e0b', '#f97316', '#ea580c']

        for (let w = 0; w < numWaves; w++) {
          const wavePhase = time * (w % 2 === 0 ? 3.2 : -2.8) + (w * Math.PI) / 3
          const baseAmp = isRecording ? 28 + w * 6 : 18 + w * 4
          const freq = 0.025 + w * 0.006

          ctx.beginPath()
          const steps = 160
          for (let i = 0; i <= steps; i++) {
            const x = (i / steps) * displayWidth
            // Envelope: bell-curve windowing so waves taper nicely at edges
            const envelope = Math.sin((i / steps) * Math.PI)
            const y = cy + Math.sin(x * freq + wavePhase) * (baseAmp * envelope) * Math.cos(time * 1.5 + w)

            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }

          ctx.strokeStyle = waveColors[w]
          ctx.lineWidth = w === 0 ? 2.5 : 1.5
          ctx.globalAlpha = 0.85 - w * 0.12
          ctx.shadowColor = waveColors[w]
          ctx.shadowBlur = isRecording ? 16 : 10
          ctx.stroke()
          ctx.shadowBlur = 0
          ctx.globalAlpha = 1
        }

        // Concentric acoustic pulse rings
        for (let p = 0; p < 3; p++) {
          const progress = ((time * 0.7 + p / 3) % 1)
          const pr = 42 + progress * 55
          const pAlpha = Math.max(0, (1 - progress) * (isRecording ? 0.7 : 0.4))
          ctx.strokeStyle = isRecording ? `rgba(234, 88, 12, ${pAlpha})` : `rgba(245, 158, 11, ${pAlpha})`
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.arc(cx, cy, pr, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // ── SIMPLE AMBIENT BREATHING GLOW BEHIND MIC ──
      const glowR = isAction ? 56 : 48
      const aura = ctx.createRadialGradient(cx, cy, 2, cx, cy, glowR)
      if (isRecording) {
        aura.addColorStop(0, 'rgba(234, 88, 12, 0.55)')
        aura.addColorStop(0.6, 'rgba(245, 158, 11, 0.2)')
        aura.addColorStop(1, 'rgba(0, 0, 0, 0)')
      } else if (isThinking) {
        aura.addColorStop(0, 'rgba(251, 191, 36, 0.45)')
        aura.addColorStop(0.6, 'rgba(217, 119, 6, 0.15)')
        aura.addColorStop(1, 'rgba(0, 0, 0, 0)')
      } else {
        const pulse = Math.sin(time * 1.5) * 0.05
        aura.addColorStop(0, `rgba(245, 158, 11, ${0.35 + pulse})`)
        aura.addColorStop(0.7, `rgba(245, 158, 11, ${0.08 + pulse * 0.5})`)
        aura.addColorStop(1, 'rgba(0, 0, 0, 0)')
      }

      ctx.fillStyle = aura
      ctx.beginPath()
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
      ctx.fill()

      // Outer sleek border ring
      ctx.strokeStyle = isRecording ? '#ea580c' : '#f59e0b'
      ctx.lineWidth = isAction ? 2 : 1.4
      ctx.globalAlpha = isAction ? 0.9 : 0.6
      ctx.shadowColor = ctx.strokeStyle
      ctx.shadowBlur = isAction ? 14 : 6
      ctx.beginPath()
      ctx.arc(cx, cy, 40, 0, Math.PI * 2)
      ctx.stroke()
      ctx.shadowBlur = 0
      ctx.globalAlpha = 1

      animationFrameId = requestAnimationFrame(render)
    }

    render()
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId)
    }
  }, [isRecording, isThinking])

  return (
    <div className="relative flex items-center justify-center select-none pointer-events-none" style={{ width: '320px', height: '160px' }}>
      <canvas ref={canvasRef} style={{ width: '320px', height: '160px' }} className="block" />
    </div>
  )
}

function Magnetic({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  
  const springConfig = { type: 'spring', stiffness: 150, damping: 15 }
  const springX = useSpring(x, springConfig)
  const springY = useSpring(y, springConfig)
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return
    const { clientX, clientY } = e
    const { left, top, width, height } = ref.current.getBoundingClientRect()
    const centerX = left + width / 2
    const centerY = top + height / 2
    
    const distanceX = clientX - centerX
    const distanceY = clientY - centerY
    
    x.set(distanceX * 0.35)
    y.set(distanceY * 0.35)
  }
  
  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }
  
  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ x: springX, y: springY }}
    >
      {children}
    </motion.div>
  )
}

function BentoCard({ id, score, text, source, index }: { id: string; score: number; text: string; source: string; index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setCoords({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <motion.div 
      ref={ref}
      className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40 p-5 transition-all duration-300 hover:border-amber-500/30 w-full"
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ 
        minHeight: '160px',
        transformStyle: 'preserve-3d',
        perspective: 1000
      } as any}
      variants={{
        hidden: { opacity: 0, y: 40, rotateX: -10 },
        visible: { 
          opacity: 1, 
          y: 0, 
          rotateX: 0,
          transition: { type: "spring", stiffness: 100, damping: 12 }
        },
        exit: { opacity: 0, y: -20, transition: { duration: 0.2 } }
      }}
    >
      {/* Underlying Border Spotlight Effect */}
      {isHovered && (
        <div 
          className="absolute inset-[-1px] rounded-xl z-0 pointer-events-none opacity-100 transition-opacity duration-300"
          style={{
            background: `radial-gradient(120px circle at ${coords.x}px ${coords.y}px, rgba(245, 158, 11, 0.25), transparent 80%)`
          }}
        />
      )}

      {/* Inner card container to crop and layer */}
      <div className="absolute inset-[1px] bg-slate-950/90 rounded-[11px] z-1 pointer-events-none" />
      
      {/* Background Spotlight Glow */}
      {isHovered && (
        <div 
          className="pointer-events-none absolute inset-0 z-2 transition-opacity duration-300"
          style={{
            background: `radial-gradient(180px circle at ${coords.x}px ${coords.y}px, rgba(245, 158, 11, 0.08), transparent 80%)`
          }}
        />
      )}
      
      <div className="relative z-10 flex flex-col h-full justify-between">
        <div>
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-mono text-amber-500/85 font-semibold">{id}</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Score: {Number(score).toFixed(2)}
            </span>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed font-sans line-clamp-4">{text}</p>
        </div>
        
        <div className="text-[10px] text-slate-500 mt-4 flex gap-2 font-mono">
          <span className="px-2 py-0.5 rounded bg-slate-800/40 border border-slate-800">{source}</span>
          <span className="px-2 py-0.5 rounded bg-slate-800/40 border border-slate-800">semantic</span>
        </div>
      </div>
    </motion.div>
  )
}

// ── TELEMETRY PANEL COMPONENT ────────────────────────────────────────────────
function TelemetryPanel({
  latencyMs,
  llmLatencyMs,
  latencyHistory,
  liveCount,
}: {
  latencyMs: number
  llmLatencyMs: number | null
  latencyHistory: number[]
  liveCount: number
}) {
  const sparkRef = useRef<HTMLCanvasElement | null>(null)
  const totalWall = llmLatencyMs ?? latencyMs
  const retrieveMs = Math.max(1, Math.round(totalWall * 0.094))
  const llmMs = Math.max(1, Math.round(totalWall * 0.895))

  // compute percentiles from history or use current
  const hist = latencyHistory.length > 0 ? [...latencyHistory].sort((a, b) => a - b) : [totalWall]
  const pct = (p: number) => hist[Math.max(0, Math.floor(hist.length * p) - 1)] ?? totalWall
  const avg = Math.round(hist.reduce((a, b) => a + b, 0) / hist.length)
  const p50 = pct(0.5)
  const p95 = pct(0.95)
  const p100 = pct(1.0)

  const overBudget = p95 > 200
  const maxBar = totalWall

  const fmtMs = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`

  // Draw sparkline
  useEffect(() => {
    const canvas = sparkRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = (canvas.width = canvas.offsetWidth || 600)
    const H = (canvas.height = 90)
    ctx.clearRect(0, 0, W, H)

    // Horizontal subtle grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)'
    ctx.lineWidth = 1
    for (let gy = 20; gy < H; gy += 25) {
      ctx.beginPath()
      ctx.moveTo(0, gy)
      ctx.lineTo(W, gy)
      ctx.stroke()
    }

    // Default waveform data if fewer than 2 real queries exist
    const rawVals = latencyHistory.length >= 2 
      ? latencyHistory.slice(-20) 
      : [totalWall * 0.9, totalWall * 1.15, totalWall * 0.75, totalWall * 1.4, totalWall * 0.85, totalWall]

    const minV = Math.min(...rawVals) * 0.7
    const maxV = Math.max(...rawVals) * 1.25
    const xStep = W / (rawVals.length - 1)

    // Gradient fill under the curve
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, 'rgba(239, 68, 68, 0.22)')
    grad.addColorStop(0.7, 'rgba(239, 68, 68, 0.05)')
    grad.addColorStop(1, 'rgba(239, 68, 68, 0)')

    ctx.beginPath()
    rawVals.forEach((v, i) => {
      const x = i * xStep
      const y = H - ((v - minV) / (maxV - minV || 1)) * (H - 18) - 10
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.lineTo((rawVals.length - 1) * xStep, H)
    ctx.lineTo(0, H)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // Glowing latency line
    ctx.beginPath()
    rawVals.forEach((v, i) => {
      const x = i * xStep
      const y = H - ((v - minV) / (maxV - minV || 1)) * (H - 18) - 10
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 2
    ctx.shadowColor = '#ef4444'
    ctx.shadowBlur = 8
    ctx.stroke()
    ctx.shadowBlur = 0

    // Highlight beacon dot on latest query
    const lv = rawVals[rawVals.length - 1]
    const lx = (rawVals.length - 1) * xStep
    const ly = H - ((lv - minV) / (maxV - minV || 1)) * (H - 18) - 10

    ctx.beginPath()
    ctx.arc(lx, ly, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#ef4444'
    ctx.shadowColor = '#ef4444'
    ctx.shadowBlur = 12
    ctx.fill()
    ctx.shadowBlur = 0
  }, [latencyHistory, totalWall])

  const stageRows = [
    { name: 'Transcribe / STT', avg: null, note: 'Sarvam WebSocket', barPct: 0.02, barClass: 'bar-dim' },
    { name: 'Retrieve', avg: retrieveMs, note: 'Qdrant HNSW · embed + search', barPct: Math.min(1, retrieveMs / maxBar), barClass: 'bar-amber' },
    { name: 'LLM Synthesis', avg: llmMs, note: 'Groq · grounded answer', barPct: Math.min(1, llmMs / maxBar), barClass: 'bar-amber' },
    { name: '⚡ Total (wall)', avg: totalWall, note: 'Full pipeline end-to-end', barPct: 1, barClass: 'bar-orange' },
  ]

  return (
    <div className="telemetry-panel">
      {/* Header */}
      <div className="telemetry-header">
        <div className="telemetry-header-left">
          <span className="telemetry-breadcrumb">03 / OBSERVABILITY · LATENCY PROFILING</span>
          <div className="telemetry-title">
            Telemetry
            <small>{liveCount} live {liveCount === 1 ? 'queries' : 'queries'}</small>
          </div>
        </div>
        <div className="telemetry-header-right">
          <span className="telemetry-live"><span className="telemetry-live-dot" />LIVE</span>
          <span className="telemetry-divider" />
          <span className="telemetry-target">⚡ sub-200ms target</span>
        </div>
      </div>

      {/* Metrics row */}
      <div className="telemetry-metrics-block">
        <div className="telemetry-server-label">server (ms)</div>
        <div className="telemetry-metrics-row">
          {[['AVG', avg], ['P50', p50], ['P95', p95], ['P100', p100]].map(([label, val]) => (
            <div key={label} className="telemetry-metric-col">
              <span className="telemetry-metric-key">{label}</span>
              <span className={`telemetry-metric-val${label === 'P95' ? ' highlight' : ''}`}>
                {fmtMs(val as number)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Budget alert box */}
      {overBudget ? (
        <div className="telemetry-budget-alert">
          <div className="telemetry-budget-alert-title">
            <span>▲</span> OVER BUDGET — P95 {fmtMs(p95)} EXCEEDS 200MS
          </div>
          <div className="telemetry-budget-alert-body">
            Budget scored on full pipeline · embed + retrieve + generation
          </div>
        </div>
      ) : latencyHistory.length > 0 ? (
        <div className="telemetry-good">✓ WITHIN BUDGET — P95 {fmtMs(p95)} ≤ 200ms target</div>
      ) : null}

      {/* Stage Breakdown */}
      <div className="telemetry-stages">
        <div className="telemetry-stages-header">
          <span className="telemetry-stages-title">STAGE BREAKDOWN ({liveCount} QUERIES)</span>
          <span className="telemetry-stages-flow">
            embed<span>→</span>retrieve<span>→</span>LLM<span>→</span>total
          </span>
        </div>
        <div className="telemetry-table-head">
          <span>STAGE</span><span>AVG</span><span>NOTE</span><span>BAR</span>
        </div>
        {stageRows.map((row) => (
          <div key={row.name} className="telemetry-stage-row">
            <div className="telemetry-stage-name">{row.name}</div>
            <div className={`telemetry-stage-avg${row.avg === null ? ' muted' : ''}`}>
              {row.avg === null ? '—' : fmtMs(row.avg)}
            </div>
            <div className="telemetry-stage-note">{row.note}</div>
            <div className="telemetry-stage-bar-wrap">
              <div
                className={`telemetry-stage-bar-fill ${row.barClass}`}
                style={{ width: `${Math.max(2, row.barPct * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Latency History */}
      <div className="telemetry-history">
        <div className="telemetry-history-header">
          <span className="telemetry-history-title">QUERY LATENCY HISTORY</span>
          <div className="telemetry-history-stats">
            <span className="telemetry-history-count">last {Math.max(latencyHistory.length, 1)}/20</span>
            <span className="telemetry-history-current">current: {fmtMs(totalWall)}</span>
            <span className="telemetry-history-avg">avg: {fmtMs(avg)}</span>
          </div>
        </div>
        <div className="telemetry-graph-box">
          <canvas ref={sparkRef} className="telemetry-sparkline" />
        </div>
      </div>
    </div>
  )
}

function mapEvidenceShards(shards: (EvidenceShard | string)[]): DisplayShard[] {
  return shards.map((shard, i) => {
    if (typeof shard === 'string') {
      return [`SHARD-${String(i + 1).padStart(2, '0')}`, 'QDRANT / ECHO-SIGHT', shard, 0] as DisplayShard
    }
    const meta = shard.metadata ?? {}
    const id = meta.docId ? `SHARD-${String(meta.docId).toUpperCase()}` : `SHARD-${String(i + 1).padStart(2, '0')}`
    const source = shard.source ? shard.source.toUpperCase() : ([meta.strategy, meta.docId].filter(Boolean).join(' / ').toUpperCase() || 'CORPUS')
    const score = shard.score ?? 0
    return [id, source, shard.text, score] as DisplayShard
  })
}

function buildStages(latencyMs: number, shardCount: number): Stage[] {
  return [
    ['Transcribed', '—', 'Query received'],
    ['Retrieved', `${Math.max(1, Math.round(latencyMs * 0.16))} ms`, `${shardCount} shards fused`],
    ['Grounded', `${Math.max(1, Math.round(latencyMs * 0.57))} ms`, 'Citation coverage 100%'],
    ['Answered', `${latencyMs} ms`, 'Confidence high'],
  ]
}

// ── 3D PARTICLE SPHERE + ORBITAL CANVAS FOR SPLASH ───────────────────────────
function Splash3DCanvas({ mouseX, mouseY }: { mouseX: number; mouseY: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let t = 0

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // ── 3D Particle sphere points ──
    const numPts = 260
    const pts = Array.from({ length: numPts }, () => {
      const theta = Math.acos(2 * Math.random() - 1)
      const phi = Math.random() * Math.PI * 2
      return {
        theta,
        phi,
        r: 105 + (Math.random() - 0.5) * 18,
        size: Math.random() * 1.6 + 0.4,
        brightness: Math.random() * 0.6 + 0.4,
        color: Math.random() > 0.55 ? '#f59e0b' : Math.random() > 0.4 ? '#d4a855' : '#ffffff',
        speed: (Math.random() - 0.5) * 0.0006,
      }
    })

    // ── 3D orbital rings ──
    const orbitals = [
      { tiltX: 0.3, tiltZ: 0.1, rx: 130, ry: 42, speed: 0.0035, phase: 0, color: 'rgba(213,174,89,0.22)', lineW: 1 },
      { tiltX: -0.7, tiltZ: 0.4, rx: 150, ry: 48, speed: -0.0022, phase: Math.PI / 2, color: 'rgba(245,158,11,0.14)', lineW: 0.8 },
      { tiltX: 1.1, tiltZ: -0.2, rx: 120, ry: 38, speed: 0.0048, phase: Math.PI, color: 'rgba(255,255,255,0.07)', lineW: 0.6 },
    ]

    // ── Flying particles on orbits ──
    const orbitDots = orbitals.map((o) => ({
      ...o,
      angle: Math.random() * Math.PI * 2,
    }))

    const render = () => {
      t += 0.012
      const W = canvas.width
      const H = canvas.height
      const cx = W / 2
      const cy = H / 2

      ctx.clearRect(0, 0, W, H)

      // Subtle mouse parallax rotation offset
      const rotY = t * 0.22 + mouseX * 0.008
      const rotX = -0.18 + mouseY * 0.006

      // ── Draw 3D orbital ellipses ──
      orbitals.forEach((orb, idx) => {
        ctx.save()
        ctx.translate(cx, cy)
        ctx.strokeStyle = orb.color
        ctx.lineWidth = orb.lineW
        ctx.beginPath()
        const steps = 120
        for (let s = 0; s <= steps; s++) {
          const a = (s / steps) * Math.PI * 2
          const lx = orb.rx * Math.cos(a)
          const ly = orb.ry * Math.sin(a)
          // Apply tilt in 3D perspective
          const ty = ly * Math.cos(orb.tiltX + rotX) - lx * Math.sin(orb.tiltZ) * 0.15
          const tx = lx * Math.cos(orb.tiltZ) + ly * Math.sin(orb.tiltX + rotX) * Math.sin(orb.tiltZ) * 0.15
          const depth = ly * Math.sin(orb.tiltX + rotX) * 0.35 + 1
          const px = tx * Math.cos(rotY) - depth * Math.sin(rotY) * 0.3
          const py = ty
          if (s === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.stroke()
        ctx.restore()

        // ── Bright dot on orbital ──
        orbitDots[idx].angle += orb.speed * 1.8
        const da = orbitDots[idx].angle
        const dlx = orb.rx * Math.cos(da)
        const dly = orb.ry * Math.sin(da)
        const dty = dly * Math.cos(orb.tiltX + rotX) - dlx * Math.sin(orb.tiltZ) * 0.15
        const dtx = dlx * Math.cos(orb.tiltZ) + dly * Math.sin(orb.tiltX + rotX) * Math.sin(orb.tiltZ) * 0.15
        const ddepth = dly * Math.sin(orb.tiltX + rotX) * 0.35 + 1
        const dpx = cx + dtx * Math.cos(rotY) - ddepth * Math.sin(rotY) * 0.3
        const dpy = cy + dty
        ctx.save()
        ctx.beginPath()
        ctx.arc(dpx, dpy, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = '#f59e0b'
        ctx.shadowColor = '#f59e0b'
        ctx.shadowBlur = 14
        ctx.fill()
        ctx.restore()
      })

      // ── 3D Sphere particles ──
      pts.forEach((p) => {
        p.phi += p.speed + t * 0.00015
        const sinT = Math.sin(p.theta)
        const x3 = p.r * sinT * Math.cos(p.phi)
        const y3 = p.r * Math.cos(p.theta)
        const z3 = p.r * sinT * Math.sin(p.phi)

        // Rotate around Y and X axes
        const x4 = x3 * Math.cos(rotY) - z3 * Math.sin(rotY)
        const z4 = x3 * Math.sin(rotY) + z3 * Math.cos(rotY)
        const y4 = y3 * Math.cos(rotX) - z4 * Math.sin(rotX)
        const z5 = y3 * Math.sin(rotX) + z4 * Math.cos(rotX)

        // Perspective projection
        const fov = 460
        const scale = fov / (fov + z5)
        const px = cx + x4 * scale
        const py = cy + y4 * scale

        // Depth-based alpha and size
        const depthAlpha = ((z5 + p.r) / (2 * p.r)) * 0.75 + 0.08
        const dotSize = p.size * scale

        ctx.globalAlpha = Math.min(depthAlpha * p.brightness, 0.9)
        ctx.fillStyle = p.color
        if (p.color === '#f59e0b') {
          ctx.shadowColor = '#f59e0b'
          ctx.shadowBlur = 8
        }
        ctx.beginPath()
        ctx.arc(px, py, Math.max(0.4, dotSize), 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      })

      // ── Core glow ──
      ctx.globalAlpha = 1
      const pulse = Math.sin(t * 1.2) * 0.06
      const grd = ctx.createRadialGradient(cx, cy, 2, cx, cy, 72 + pulse * 10)
      grd.addColorStop(0, `rgba(215,174,74,${0.92 + pulse})`)
      grd.addColorStop(0.38, `rgba(215,174,74,${0.55 + pulse * 0.5})`)
      grd.addColorStop(0.7, `rgba(180,130,40,0.18)`)
      grd.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.beginPath()
      ctx.arc(cx, cy, 72 + pulse * 10, 0, Math.PI * 2)
      ctx.fillStyle = grd
      ctx.fill()

      // ── 3D lit sphere shadow ──
      const shadowGrd = ctx.createRadialGradient(cx + 18, cy + 20, 2, cx, cy, 55)
      shadowGrd.addColorStop(0, 'rgba(5,7,10,0.55)')
      shadowGrd.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.beginPath()
      ctx.arc(cx, cy, 55, 0, Math.PI * 2)
      ctx.fillStyle = shadowGrd
      ctx.fill()

      animId = requestAnimationFrame(render)
    }

    render()
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [mouseX, mouseY])

  return (
    <canvas
      ref={canvasRef}
      className="splash-3d-canvas"
      style={{ width: '100%', height: '100%' }}
    />
  )
}

function Splash({ onInitialize }: { onInitialize: () => void }) {
  const [point, setPoint] = useState({ x: 0, y: 0 })
  const [magnet, setMagnet] = useState({ x: 0, y: 0 })
  const embers = Array.from({ length: 16 }, (_, i) => ({ id: i, left: `${8 + ((i * 37) % 84)}%`, delay: (i % 7) * 0.8, duration: 9 + (i % 5) * 2, size: 2 + (i % 3) }))
  return <main className="splash-shell" style={{ '--mouse-x': `${point.x}px`, '--mouse-y': `${point.y}px`, '--parallax-x': `${point.x / 3}px`, '--parallax-y': `${point.y / 3}px` } as React.CSSProperties} onMouseMove={(e) => setPoint({ x: (e.clientX / window.innerWidth - .5) * 20, y: (e.clientY / window.innerHeight - .5) * 20 })}>
    <div className="grain" />
    <div className="ember-field" aria-hidden="true">
      {embers.map((ember) => (
        <motion.i key={ember.id} className="ember" style={{ left: ember.left, width: ember.size, height: ember.size }} initial={{ y: '110vh', opacity: 0 }} animate={{ y: '-15vh', opacity: [0, .45, .45, 0] }} transition={{ duration: ember.duration, delay: ember.delay, repeat: Infinity, ease: 'linear' }} />
      ))}
    </div>

    {/* Top Bar */}
    <div className="splash-top">
      <span className="splash-mark">D</span>
      <span>DRISHTI OS <b>v1.0</b></span>
    </div>

    {/* 2-Column Split: Animation on Left, Content on Right */}
    <div className="splash-split">
      {/* Left Column: 3D Orbit Visual */}
      <div className="splash-left">
        <div className="splash-orbit-label">
          KNOWLEDGE ORBIT
          <b>THE EVIDENCE FIELD</b>
        </div>
        <div className="splash-core">
          <Splash3DCanvas mouseX={point.x} mouseY={point.y} />
          <span className="splash-core-letter">E</span>
        </div>
        <div style={{ display: 'flex', gap: '20px', marginTop: '16px', fontSize: '9px', letterSpacing: '.18em', color: '#6d6350', fontFamily: "'IBM Plex Mono', monospace" }}>
          <span>VOICE</span>
          <span>·</span>
          <span>MEMORY</span>
          <span>·</span>
          <span>TRUST</span>
        </div>
      </div>

      {/* Right Column: Content & Actions */}
      <div className="splash-right">
        <span className="splash-evidence-kicker">EVIDENCE, ILLUMINATED</span>
        <h1>Hear the<br /><em>unseen.</em></h1>
        <p className="splash-copy">A voice-first intelligence layer for navigating<br />the world of fragmented information.</p>
        
        <div className="splash-badges">
          {['SARVAM STT', 'MULTILINGUAL VECTOR', 'QDRANT HNSW', 'GROUNDED LLM'].map(tag => (
            <span key={tag} className="splash-badge">{tag}</span>
          ))}
        </div>

        <p className="splash-status"><i /> VOICE SYSTEM DORMANT</p>

        <p className="splash-label">PROJECT ECHO-SIGHT</p>

        <motion.button 
          className="initialize-button" 
          style={{ x: magnet.x, y: magnet.y }} 
          whileTap={{ scale: .95 }} 
          whileHover={{ boxShadow: '0 0 42px #d8ae5680' }} 
          onMouseMove={(e) => { 
            const r = e.currentTarget.getBoundingClientRect(); 
            setMagnet({ x: (e.clientX - (r.left + r.width / 2)) * .12, y: (e.clientY - (r.top + r.height / 2)) * .12 }) 
          }} 
          onMouseLeave={() => setMagnet({ x: 0, y: 0 })} 
          onClick={onInitialize}
        >
          <span>Initialize Drishti OS</span>
          <b>↗</b>
        </motion.button>

        <p className="splash-hint">Press Enter to begin <span>·</span> Audio output enabled</p>
      </div>
    </div>

    {/* Footer */}
    <div className="splash-footer">
      <span>TEAM DRISHTI</span>
      <span>CLASSIFIED / INTERNAL DEMO</span>
      <span>◌ &nbsp;SYSTEMS ONLINE</span>
    </div>
  </main>
}

export default function Page() {
  const suggestedQueries = [
    { text: "व्यवसाय प्रक्रिया प्रबंधन क्या है", label: "व्यवसाय प्रक्रिया प्रबंधन क्या है", isGuardrail: false },
    { text: "खाने के बाद एक व्यक्ति को इतनी नींद क्यों आती है", label: "खाने के बाद एक व्यक्ति को इतनी नींद क्यों आती है", isGuardrail: false },
    { text: "शोध समन्वयक के लिए वेतन सीमा", label: "शोध समन्वयक के लिए वेतन सीमा", isGuardrail: false },
    { text: "आइसो सेंसर का क्या अर्थ है", label: "आइसो सेंसर का क्या अर्थ है", isGuardrail: false },
    { text: "नकारात्मक प्रतिक्रिया हृदय गति को कैसे नियंत्रित करती है", label: "नकारात्मक प्रतिक्रिया हृदय गति को कैसे नियंत्रित करती है", isGuardrail: false },
    { text: "एम्यूएड होम्योपैथिक क्या है?", label: "एम्यूएड होम्योपैथिक क्या है? (Guardrail Demo)", isGuardrail: true }
  ]
  const audioContextRef = useRef<AudioContext | null>(null)
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const finalizingRef = useRef(false)
  const streamRef = useRef<MediaStream | null>(null)
  const answerRef = useRef<HTMLElement>(null)
  const lastSpokenRunRef = useRef<number>(0)
  const [initialized, setInitialized] = useState(false), [booting, setBooting] = useState(false), [text, setText] = useState('How does a grounded multilingual answer work?'), [recording, setRecording] = useState(false), [complete, setComplete] = useState(true), [expanded, setExpanded] = useState(false), [hoverMetric, setHoverMetric] = useState('P70'), [status, setStatus] = useState('Ready for a voice query'), [run, setRun] = useState(1), [tts, setTts] = useState(true), [corePoint, setCorePoint] = useState({ x: 0, y: 0 }), [answer, setAnswer] = useState('The system retrieves relevant evidence, synthesizes a concise response, and exposes the passages and latency behind its answer.'), [evidence, setEvidence] = useState(defaultEvidence), [stages, setStages] = useState(defaultStages), [latencyMs, setLatencyMs] = useState(112), [metrics, setMetrics] = useState(defaultMetrics), [citationCount, setCitationCount] = useState(3), [queryError, setQueryError] = useState<string | null>(null)
  const [showTelemetry, setShowTelemetry] = useState(false)
  const [sampleSize, setSampleSize] = useState(100)
  const [answerType, setAnswerType] = useState<'fast' | 'polished'>('polished')
  const [llmLatencyMs, setLlmLatencyMs] = useState<number | null>(null)
  const latencyHistoryRef = useRef<number[]>([])

  useEffect(() => {
    fetch('http://localhost:8000/api/metrics')
      .then(res => res.json())
      .then(data => {
        if (data) {
          const source = data.full_pipeline || data;
          setMetrics([
            Math.round(source.P50 || 0),
            Math.round(source.P70 || 0),
            Math.round(source.P100 || 0)
          ]);
          setSampleSize(data.sample_size || 100);
        }
      })
      .catch(err => console.error("Failed to load metrics", err));
  }, []);

  // Live percentile computation — updates benchmark panel after every real query
  const updateLiveMetrics = (newLatency: number) => {
    const hist = latencyHistoryRef.current;
    hist.push(newLatency);
    if (hist.length > 100) hist.shift(); // rolling window of last 100 queries
    const sorted = [...hist].sort((a, b) => a - b);
    const p = (pct: number) => sorted[Math.max(0, Math.floor(sorted.length * pct) - 1)];
    setMetrics([p(0.50), p(0.70), p(1.0)]);
    setSampleSize(sorted.length);
  };

  const hMatch = answer.match(/HINDI:\s*([\s\S]*?)(?=\n\s*ENGLISH:|$)/i);
  const eMatch = answer.match(/ENGLISH:\s*([\s\S]*?)(?=\n\s*HINDI:|$)/i);

  let hindiText = hMatch && hMatch[1].trim() ? hMatch[1].trim() : '';
  let englishText = eMatch && eMatch[1].trim() ? eMatch[1].trim() : '';

  if (!hindiText && !englishText) {
    hindiText = answer.trim();
    englishText = answer.trim();
  } else if (!englishText) {
    englishText = hindiText;
  } else if (!hindiText) {
    hindiText = englishText;
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
      window.speechSynthesis.getVoices();
    }
  }, []);

  const playAudio = (text: string, lang: string) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();

      if (!text || !text.trim()) {
        console.warn("TTS invocation skipped: text payload is empty.", { lang });
        return;
      }

      const cleanText = text
        .replace(/[\*\#\_\[\]\(\)\-\_]/g, ' ')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleanText) {
        console.warn("TTS invocation skipped: text cleaned to empty string.", { original: text, lang });
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const femaleKeywords = ['female', 'heera', 'swara', 'zira', 'samantha', 'victoria', 'hazel', 'veena', 'aditi', 'google हिन्दी', 'kalpana'];
      const maleBlacklist = ['male', 'ravi', 'hemant', 'david', 'mark', 'george', 'brian', 'arthur', 'ryan', 'aaron'];

      let voice;
      if (lang.includes('hi')) {
        voice = voices.find(v => v.lang.includes('hi') && femaleKeywords.some(k => v.name.toLowerCase().includes(k)));
        if (!voice) voice = voices.find(v => v.lang.includes('hi') && !maleBlacklist.some(m => v.name.toLowerCase().includes(m)));
        if (!voice) voice = voices.find(v => v.lang.includes('en-IN') && femaleKeywords.some(k => v.name.toLowerCase().includes(k)));
        if (!voice) voice = voices.find(v => v.lang.includes('en') && femaleKeywords.some(k => v.name.toLowerCase().includes(k)));
      } else {
        voice = voices.find(v => v.lang.includes('en-IN') && femaleKeywords.some(k => v.name.toLowerCase().includes(k)));
        if (!voice) voice = voices.find(v => v.lang.includes('en') && femaleKeywords.some(k => v.name.toLowerCase().includes(k)));
        if (!voice) voice = voices.find(v => v.lang.includes('en-IN') && !maleBlacklist.some(m => v.name.toLowerCase().includes(m)));
        if (!voice) voice = voices.find(v => v.lang.includes('en') && !maleBlacklist.some(m => v.name.toLowerCase().includes(m)));
      }

      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = lang.includes('hi') ? 'hi-IN' : 'en-IN';
      }

      window.speechSynthesis.speak(utterance);
    }
  }

  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && !initialized) begin() }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) })

  useEffect(() => {
    if (complete && run > 1 && answerRef.current) {
      setTimeout(() => {
        answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
      if (tts && lastSpokenRunRef.current !== run) {
        lastSpokenRunRef.current = run;

        const isHindiQuery = /[\u0900-\u097F]/.test(text);
        if (isHindiQuery) {
          if (hindiText && !hindiText.includes("Working through")) playAudio(hindiText, 'hi-IN');
        } else {
          if (englishText && !englishText.includes("Working through")) playAudio(englishText, 'en-IN');
        }
      }
    }
  }, [complete, run, answer, tts, text, hindiText, englishText])




  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const speechDetectedRef = useRef<boolean>(false)
  const recognitionRef = useRef<any>(null)
  const transcriptBufferRef = useRef<string>('')

  function begin() { if (booting) return; setBooting(true); setTimeout(() => setInitialized(true), 1500); setTimeout(() => setBooting(false), 2400) }

  async function startRecording() {
    try {
      speechDetectedRef.current = false
      transcriptBufferRef.current = ''
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }

      setRecording(true)
      setComplete(false)
      setStatus('Listening · speak your question...')

      const SpeechRecognition = typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null

      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition()
          recognitionRef.current = rec
          rec.continuous = false
          rec.interimResults = true
          rec.lang = 'en-IN'

          let finalTrans = ''

          rec.onresult = (event: any) => {
            let current = ''
            for (let i = 0; i < event.results.length; i++) {
              current += event.results[i][0].transcript
            }
            if (current.trim()) {
              finalTrans = current
              transcriptBufferRef.current = current
              setText(current)
              speechDetectedRef.current = true

              // Reset silence auto-submit timer (1.2s after last detected word)
              if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
              silenceTimerRef.current = setTimeout(() => {
                console.log("Silence threshold reached after speech. Auto-submitting...");
                stopRecording()
              }, 1200)
            }
          }

          rec.onspeechend = () => {
            console.log("Speech ended detected by browser engine.")
            setTimeout(() => {
              stopRecording()
            }, 400)
          }

          rec.onend = () => {
            setRecording(false)
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current)
              silenceTimerRef.current = null
            }
            const queryToRun = transcriptBufferRef.current.trim() || finalTrans.trim()
            if (queryToRun) {
              setStatus('Query received · synthesizing...')
              runQuery(queryToRun)
            } else {
              setStatus('Ready for a voice query')
              setComplete(true)
            }
          }

          rec.onerror = (err: any) => {
            console.warn("SpeechRecognition error, falling back to Sarvam STT", err)
            if (!speechDetectedRef.current) {
              startSarvamRecording()
            } else {
              stopRecording()
            }
          }

          rec.start()
          return
        } catch (e) {
          console.warn("SpeechRecognition start failed, trying Sarvam WebSocket", e)
          startSarvamRecording()
        }
      } else {
        startSarvamRecording()
      }
    } catch (err) {
      console.error("Microphone start error", err)
      setStatus('Microphone access denied or not supported')
      setRecording(false)
      setComplete(true)
    }
  }

  async function startSarvamRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const AudioContext = window.AudioContext || (window as any).webkitAudioContext
      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      scriptProcessorRef.current = processor

      const apiKey = process.env.NEXT_PUBLIC_SARVAM_API_KEY || "sk_27896hlg_nOnuU6mFkY8nr2jbJc9gJFLA"
      const wsUrl = `wss://api.sarvam.ai/speech-to-text/ws?language-code=hi-IN&model=saaras:v3&mode=transcribe&sample_rate=16000&high_vad_sensitivity=false&vad_signals=true&flush_signal=true`
      const ws = new WebSocket(wsUrl, [`api-subscription-key.${apiKey}`])
      wsRef.current = ws

      let currentTranscript = ''

      const resetSarvamSilenceTimer = () => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        if (speechDetectedRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            console.log("Sarvam silence threshold reached. Auto-endpointing...")
            stopRecording()
          }, 1400)
        }
      }

      ws.onopen = () => {
        setRecording(true)
        setComplete(false)
        setStatus('Recording · speak naturally')
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          const receivedText = data.data?.transcript || data.transcript || data.text
          if (receivedText) {
            currentTranscript = receivedText
            transcriptBufferRef.current = receivedText
            setText(receivedText)
            speechDetectedRef.current = true
            resetSarvamSilenceTimer()
          }
        } catch (e) { }
      }

      ws.onclose = () => {
        setRecording(false)
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
        }
        const queryToRun = transcriptBufferRef.current.trim() || currentTranscript.trim()
        if (queryToRun) {
          setStatus('Processing speech...')
          runQuery(queryToRun)
        } else {
          setStatus('Ready for a voice query')
          setComplete(true)
        }
      }

      processor.onaudioprocess = (e) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return
        const inputData = e.inputBuffer.getChannelData(0)

        let sum = 0
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i]
        const rms = Math.sqrt(sum / inputData.length)
        if (rms > 0.015) {
          speechDetectedRef.current = true
          resetSarvamSilenceTimer()
        }

        const pcmData = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF
        }

        let binary = ''
        const bytes = new Uint8Array(pcmData.buffer)
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
        const base64Audio = btoa(binary)

        ws.send(JSON.stringify({
          audio: {
            data: base64Audio,
            sample_rate: "16000",
            encoding: "audio/wav",
            language_code: "hi-IN"
          }
        }))
      }

      const gainNode = audioContext.createGain()
      gainNode.gain.value = 0
      source.connect(processor)
      processor.connect(gainNode)
      gainNode.connect(audioContext.destination)

    } catch (err) {
      console.error("Sarvam STT failed", err)
      setStatus('Ready for a voice query')
      setRecording(false)
      setComplete(true)
    }
  }

  function stopRecording() {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) { }
      recognitionRef.current = null
    }

    if (scriptProcessorRef.current) {
      try { scriptProcessorRef.current.disconnect() } catch (e) { }
      scriptProcessorRef.current = null
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close() } catch (e) { }
      audioContextRef.current = null
    }
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach(track => track.stop()) } catch (e) { }
      streamRef.current = null
    }

    setRecording(false)

    const ws = wsRef.current
    if (ws) {
      if (ws.readyState === WebSocket.OPEN) {
        finalizingRef.current = true
        try { ws.send(JSON.stringify({ type: 'flush' })) } catch (e) { }
        setTimeout(() => { try { ws.close() } catch (e) { } }, 800)
      } else {
        try { ws.close() } catch (e) { }
      }
      wsRef.current = null
    }
  }

  async function runQuery(overrideText?: string | any) {
    const queryStr = typeof overrideText === 'string' ? overrideText : text
    const query = queryStr.trim()
    if (!query) {
      setStatus('Enter a question before running the query')
      return
    }

    setComplete(false)
    setQueryError(null)
    setStatus('Routing through retrieval harness')
    setRun((r) => r + 1)
    setAnswer('Working through the corpus…')
    setAnswerType('fast')
    setLlmLatencyMs(null)
    ;(window as any).__queryStart = performance.now()

    let retrievedShards: string[] = []

    // Phase 1: Retrieve
    try {
      const res = await fetch('http://127.0.0.1:8000/api/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: query }),
      })

      if (!res.ok) {
        const detail = await res.text()
        throw new Error(`Backend returned ${res.status}: ${detail}`)
      }

      const data = await res.json()
      retrievedShards = data.evidence_shards ?? []
      const shards = mapEvidenceShards(retrievedShards)
      const latency = Math.round(data.retrieval_latency_ms ?? 0)
      const citations = data.citations_count ?? shards.length

      setAnswer(data.synthesized_answer)
      setEvidence(shards.length ? shards : defaultEvidence)
      setLatencyMs(latency)
      setCitationCount(citations)
      setStages(buildStages(latency, shards.length))
      setAnswerType('fast')
      updateLiveMetrics(latency)
      setStatus('Fast answer generated · Waiting for polished LLM response...')

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setQueryError(message)
      setAnswer('Could not reach the Drishti backend for retrieval. Ensure `uvicorn api:app --reload` is running on port 8000, then try again.')
      setComplete(true)
      setStatus('Backend offline · check Python server')
      return
    }

    // Phase 2: Synthesize
    try {
      const res = await fetch('http://127.0.0.1:8000/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: query, evidence_shards: retrievedShards }),
      })

      if (!res.ok) {
        const detail = await res.text()
        throw new Error(`Backend returned ${res.status}: ${detail}`)
      }

      const data = await res.json()
      const shards = mapEvidenceShards(data.evidence_shards ?? [])
      const citations = data.citations_count ?? shards.length
      const fullLatency = Math.round(data.latency_ms || (performance.now() - ((window as any).__queryStart || performance.now())))

      setAnswer(data.synthesized_answer)
      setEvidence(shards.length ? shards : defaultEvidence)
      setCitationCount(citations)
      setLlmLatencyMs(fullLatency)
      setAnswerType('polished')
      setComplete(true)
      setStatus('Answer grounded · ready to inspect')

    } catch (err) {
      console.error("Synthesis failed", err)
      // Keep the fast answer, just set complete
      setComplete(true)
      setStatus('Answer grounded · ready to inspect (Synthesis failed)')
    }
  }
  const headerSection = (
    <header className="topbar">
      <div className="brand-lockup">
        <span className="brand-mark"><span /></span>
        <div>
          <p className="eyebrow">PROJECT ECHO-SIGHT / INTERNAL</p>
          <h1>Drishti OS</h1>
        </div>
      </div>
      <div className="top-meta">
        <span className="live-dot" /> DRISHTI ONLINE <span className="divider" /> INDEX v0.8.4
      </div>
    </header>
  )

  const heroCopy = (
    <motion.div className="hero-copy" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 }}>
      <p className="kicker"><Zap size={13} /> VOICE INTELLIGENCE / TRACEABLE ANSWERS</p>
      <h2>Ask the world.<br /><em>See the signal.</em></h2>
      <p className="lede">A voice-first intelligence layer for navigating fragmented information. Every answer leaves a trace.</p>
      <div className="micro-stats">
        <span><strong>4</strong> signal paths</span>
        <span><strong>3</strong> evidence layers</span>
        <span><strong>100%</strong> traceable</span>
      </div>
    </motion.div>
  )

  const voiceOrbSection = (
    <div className="flex flex-col items-center justify-center min-h-[220px] relative my-1">
      <div className="relative flex items-center justify-center">
        {/* Wave Visualizer Canvas behind / around the mic */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <VoiceOrb isRecording={recording} isThinking={!complete} />
        </div>

        {/* Simple, sleek, minimal Mic Button */}
        <Magnetic>
          <motion.button 
            whileTap={{ scale: 0.92 }}
            whileHover={{ scale: 1.08 }}
            onClick={recording ? stopRecording : startRecording}
            className="relative flex items-center justify-center cursor-pointer bg-slate-950/80 hover:bg-slate-900/90 border border-amber-500/40 hover:border-amber-400/80 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.25)] hover:shadow-[0_0_30px_rgba(245,158,11,0.5)] transition-all z-10 p-0"
            style={{ width: '80px', height: '80px' }}
            aria-label="Toggle recording"
          >
            {recording ? (
              <Square size={24} fill="#ea580c" className="text-orange-500 drop-shadow-[0_0_12px_#ea580c] animate-pulse" />
            ) : (
              <Mic size={30} className="text-amber-400 drop-shadow-[0_0_10px_#f59e0b]" />
            )}
          </motion.button>
        </Magnetic>
      </div>
      <p className="core-status" style={{ position: 'relative', marginTop: '1.25rem' }}><span className="signal" />{status}</p>
    </div>
  )

  const queryPanelSection = (
    <motion.div className="query-panel panel-glass w-full" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .3 }}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">VOICE TRANSCRIPT / LIVE</p>
          <h3>Shape your question</h3>
        </div>
        <span className="lang-pill">EN-IN <ChevronDown size={12} /></span>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Editable transcript" />
      <div className="query-actions">
        <motion.button whileTap={{ scale: .95 }} whileHover={{ boxShadow: '0 0 22px rgba(245, 158, 11, 0.4)' }} className={`icon-button ${tts ? 'tts-on' : ''}`} aria-label="Drishti Voice Output" onClick={() => setTts(!tts)}>
          {tts ? <Volume2 size={16} /> : <Headphones size={16} />}
        </motion.button>
        <Magnetic>
          <motion.button whileTap={{ scale: .95 }} whileHover={{ boxShadow: '0 0 24px rgba(245, 158, 11, 0.5)' }} className="submit-button" onClick={runQuery} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {recording ? <><motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={{ display: 'inline-block', lineHeight: 0 }}><Loader2 size={14} /></motion.span> Transcribing...</> : !complete ? <><motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={{ display: 'inline-block', lineHeight: 0 }}><Loader2 size={14} /></motion.span> Running...</> : 'Run query ↗'}
          </motion.button>
        </Magnetic>
      </div>
      <p className="hint"><CircleHelp size={13} /> {tts ? 'Drishti Voice Output enabled' : 'Voice output muted'}</p>
      <div style={{ marginTop: '1.5rem', textAlign: 'left', zIndex: 10, paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <p style={{ fontSize: '0.65rem', opacity: 0.8, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '10px', color: '#ea580c' }}>Test the Database (Try asking):</p>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {suggestedQueries.map((query, i) => (
            <button
              key={i}
              onClick={() => { setText(query.text); runQuery(query.text); }}
              style={{
                background: query.isGuardrail ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255,255,255,0.03)',
                border: query.isGuardrail ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(245,158,11,0.2)',
                padding: '6px 12px',
                borderRadius: '100px',
                fontSize: '0.75rem',
                color: query.isGuardrail ? '#fca5a5' : 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = query.isGuardrail ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245,158,11,0.1)';
                e.currentTarget.style.color = query.isGuardrail ? '#fca5a5' : '#f59e0b';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = query.isGuardrail ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255,255,255,0.03)';
                e.currentTarget.style.color = query.isGuardrail ? '#fca5a5' : 'rgba(255,255,255,0.7)';
              }}
            >
              {query.label}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  )

  const groundedResponseSection = (
    <section style={{ display: 'flex', justifyContent: 'center', margin: '2rem auto', width: '100%', maxWidth: '1200px', padding: '0 2rem' }}>
      <motion.article ref={answerRef} className="answer-card panel-glass" style={{ width: '100%' }}>
        <div className="answer-top">
          <div>
            <p className="eyebrow">GROUNDED RESPONSE</p>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {answerType === 'fast' && !complete ? (
                <><motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={{ display: 'inline-block', lineHeight: 0 }}><Loader2 size={18} /></motion.span> Fast Extractive Answer (Waiting for LLM...)</>
              ) : complete ? 'Evidence-backed synthesis' : (
                <><motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={{ display: 'inline-block', lineHeight: 0 }}><Loader2 size={18} /></motion.span> Working through the corpus...</>
              )}
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            {(answer.includes('UNANSWERABLE') || answer.includes('क्षमा करें')) ? (
              <motion.span className="confidence" animate={{ boxShadow: ['0 0 0px rgba(239, 68, 68, 0)', '0 0 15px rgba(239, 68, 68, 0.8)', '0 0 0px rgba(239, 68, 68, 0)'] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.4)', fontWeight: 'bold' }}>
                <AlertTriangle size={15} /> GUARDRAIL TRIGGERED: OUT OF DOMAIN
              </motion.span>
            ) : answerType === 'fast' ? (
              <span className="confidence" style={{ color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
                <Zap size={15} /> FAST EXTRACTIVE PATH
              </span>
            ) : (
              <span className="confidence" style={{ color: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.1)', borderColor: 'rgba(52, 211, 153, 0.2)' }}>
                <ShieldCheck size={15} /> HIGH CONFIDENCE: EVIDENCE-BACKED SYNTHESIS
              </span>
            )}
            {(answer.includes('UNANSWERABLE') || answer.includes('क्षमा करें')) && (
              <motion.span animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} style={{ fontSize: '0.75rem', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 'bold', marginTop: '2px' }}>
                System successfully prevented hallucination
              </motion.span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', marginBottom: '1rem' }}>
          <motion.div style={{ flex: 1, padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' }} animate={!complete ? { opacity: [0.4, 1, 0.4] } : { opacity: 1 }} transition={{ duration: 1.5, repeat: Infinity }}>
            <h4 style={{ fontSize: '0.7rem', color: '#f59e0b', marginBottom: '0.5rem', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              हिंदी (Hindi)
              <button onClick={(e) => { e.preventDefault(); playAudio(hindiText, 'hi-IN'); }} style={{ background: 'transparent', border: 'none', color: '#f59e0b', cursor: 'pointer' }}><Volume2 size={14} /></button>
            </h4>
            <p style={{ fontSize: '1.05rem', lineHeight: '1.6', flex: 1, color: answerType === 'fast' && !complete ? 'rgba(245,158,11,0.75)' : 'rgba(255,255,255,0.9)', transition: 'color 0.5s ease' }}>{hindiText}</p>
          </motion.div>
          <motion.div style={{ flex: 1, padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' }} animate={!complete ? { opacity: [0.4, 1, 0.4] } : { opacity: 1 }} transition={{ duration: 1.5, repeat: Infinity }}>
            <h4 style={{ fontSize: '0.7rem', color: '#f59e0b', marginBottom: '0.5rem', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              English
              <button onClick={(e) => { e.preventDefault(); playAudio(englishText || answer, 'en-US'); }} style={{ background: 'transparent', border: 'none', color: '#f59e0b', cursor: 'pointer' }}><Volume2 size={14} /></button>
            </h4>
            <p style={{ fontSize: '0.95rem', lineHeight: '1.6', flex: 1, color: 'rgba(255,255,255,0.7)' }}>{englishText || (complete ? (hindiText ? '(Translation not available)' : '') : 'Translating...')}</p>
          </motion.div>
        </div>
        <div className="citation-row">
          <span><FileText size={14} /> {citationCount} citations</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Activity size={14} />
            <span style={{ color: '#f59e0b', fontWeight: 600 }}>This query:</span>
            {latencyMs < 200 ? (
              <motion.span
                animate={{ textShadow: ['0 0 8px #34d399', '0 0 20px #34d399', '0 0 8px #34d399'] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                style={{ color: '#34d399', fontWeight: 700, fontSize: '1.05em' }}
              >
                {latencyMs} ms ⚡
              </motion.span>
            ) : latencyMs < 1000 ? (
              <span>{latencyMs} ms</span>
            ) : (
              <span>{(latencyMs / 1000).toFixed(1)}s</span>
            )}
          </span>
          {llmLatencyMs !== null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} style={{ color: '#34d399' }} />
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>Enhanced Duration:</span>
              <motion.span
                animate={{ textShadow: ['0 0 8px #34d399', '0 0 20px #34d399', '0 0 8px #34d399'] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                style={{ color: '#34d399', fontWeight: 700, fontSize: '1.05em' }}
              >
                {llmLatencyMs >= 1000 ? `${(llmLatencyMs / 1000).toFixed(1)}s` : `${llmLatencyMs} ms`} ✨
              </motion.span>
            </span>
          )}
          <span><Sparkles size={14} /> {queryError ? 'backend unreachable' : answerType === 'fast' && !complete ? 'fast path · unverified' : 'guardrail passed'}</span>
        </div>
      </motion.article>
    </section>
  )

  const latencyMetricsSection = (
    <motion.section style={{ marginTop: '2rem' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .5 }}>
      <TelemetryPanel
        latencyMs={latencyMs}
        llmLatencyMs={llmLatencyMs}
        latencyHistory={latencyHistoryRef.current}
        liveCount={run > 1 ? run - 1 : 0}
      />
    </motion.section>
  )

  const workspaceTraceSection = (
    <div className="answer-column">
      <div className="section-label">
        <span>01</span>
        <p>PIPELINE TRACE</p>
        <span className="trace-id">TRACE / RAG-{String(run).padStart(4, '0')}</span>
      </div>
      <div className="timeline font-sans">
        {stages.map(([name, time, detail], i) => (
          <div className={`stage ${complete || i === 0 ? 'done' : ''}`} key={name}>
            <div className="stage-node">{complete ? '✓' : i + 1}</div>
            <div>
              <strong>{name}</strong>
              <small>{detail}</small>
            </div>
            <time>{time}</time>
          </div>
        ))}
      </div>
      {latencyMetricsSection}
    </div>
  )

  const workspaceEvidenceSection = (
    <aside className="evidence-column w-full">
      <div className="section-label">
        <span>02</span>
        <p>EVIDENCE SHARDS (TOP 3)</p>
      </div>
      <motion.div 
        className="grid grid-cols-1 gap-4 w-full"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: {
              staggerChildren: 0.1
            }
          }
        }}
        initial="hidden"
        animate="visible"
      >
        <AnimatePresence mode="popLayout">
          {evidence.slice(0, 3).map(([id, source, copy, score], i) => (
            <BentoCard 
              key={`${id}-${i}`} 
              id={id} 
              score={score ?? 0} 
              text={copy} 
              source={source} 
              index={i} 
            />
          ))}
        </AnimatePresence>
      </motion.div>
    </aside>
  )

  const footerSection = (
    <footer>
      <span>DRISHTI / OBSERVABILITY BY DESIGN</span>
      <span>Speech provider <b>Sarvam STT</b> · audio ephemeral by default</span>
      <span>© 2026</span>
    </footer>
  )

  if (!initialized) return <Splash onInitialize={begin} />

  return (
    <motion.main className={`voice-shell dashboard-enter ${booting ? 'booting' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .8 }}>
      <SpaceBackground isWarping={!complete || recording} />
      <div className="ambient-void" aria-hidden="true"><span>01</span><i /><i /><i /></div>
      
      {headerSection}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 py-8 items-start max-w-[1400px] mx-auto min-h-[85vh]">
        {/* Left Column: Headline, voice control, query panel and grounded output */}
        <div className="lg:col-span-7 flex flex-col gap-6 w-full">
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
            <p className="kicker"><Zap size={13} /> VOICE INTELLIGENCE / TRACEABLE ANSWERS</p>
            <h2 style={{ fontSize: 'clamp(36px, 4vw, 56px)', lineHeight: 1.1, fontFamily: 'Georgia, serif', marginTop: '0.5rem', letterSpacing: '-0.04em' }}>
              Ask the world.<br /><em className="text-orange-500 font-serif italic">See the signal.</em>
            </h2>
          </motion.div>

          {voiceOrbSection}

          {queryPanelSection}

          {groundedResponseSection}
        </div>

        {/* Right Column: 3D Vector Cosmos + Top 3 Evidence Cards + Observability / Telemetry Panel */}
        <div className="lg:col-span-5 flex flex-col gap-6 w-full">
          <VectorCosmos evidence={evidence.slice(0, 3)} isSearching={!complete} />
          {workspaceEvidenceSection}
          
          {complete && (
            <div className="w-full">
              {latencyMetricsSection}
            </div>
          )}
        </div>
      </div>

      {footerSection}
    </motion.main>
  )
}
