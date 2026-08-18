'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minimize2 } from 'lucide-react'

type HoloMode = 'domain' | 'heatmap' | 'dimensions'

interface VectorCosmosProps {
  evidence?: [id: string, source: string, copy: string, score: number][]
  isSearching?: boolean
  className?: string
}

export function VectorCosmos({ evidence = [], isSearching = false, className = '' }: VectorCosmosProps) {
  const [isHolodeckOpen, setIsHolodeckOpen] = useState(false)
  const [holoMode, setHoloMode] = useState<HoloMode>('domain')
  const cosmosCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const holodeckCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const mouseOrbitRef = useRef({ isDragging: false, startX: 0, startY: 0, rotX: 0, rotY: 0 })

  // Lock body scroll when holodeck is open
  useEffect(() => {
    document.body.style.overflow = isHolodeckOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isHolodeckOpen])

  // ── MINI CARD COSMOS CANVAS ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = cosmosCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let width = (canvas.width = canvas.parentElement?.clientWidth || 320)
    let height = (canvas.height = 190)

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return
      width = canvas.width = canvas.parentElement.clientWidth
      height = canvas.height = 190
    }
    window.addEventListener('resize', handleResize)

    const points = Array.from({ length: 85 }).map(() => {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 2 - 1)
      const r = 55 + Math.random() * 40
      return {
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi),
        color: Math.random() > 0.5 ? '#f59e0b' : '#ea580c'
      }
    })

    let angle = 0
    const render = () => {
      angle += isSearching ? 0.045 : 0.014
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2, cy = height / 2

      const glowGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, 70)
      glowGrad.addColorStop(0, 'rgba(245, 158, 11, 0.38)')
      glowGrad.addColorStop(0.5, 'rgba(234, 88, 12, 0.15)')
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glowGrad
      ctx.beginPath()
      ctx.arc(cx, cy, 70, 0, Math.PI * 2)
      ctx.fill()

      const projected = points.map((p) => {
        const cosA = Math.cos(angle), sinA = Math.sin(angle)
        const xRot = p.x * cosA - p.z * sinA
        const zRot = p.x * sinA + p.z * cosA
        const fov = 170
        const scale = fov / (fov + zRot + 45)
        return {
          px: cx + xRot * scale,
          py: cy + p.y * scale,
          size: Math.max(1, 2.8 * scale),
          alpha: Math.min(1, Math.max(0.2, (zRot + 90) / 180)),
          color: p.color
        }
      })

      ctx.strokeStyle = 'rgba(245, 158, 11, 0.18)'
      ctx.lineWidth = 0.8
      for (let i = 0; i < projected.length; i += 2) {
        if (projected[i + 1]) {
          ctx.beginPath()
          ctx.moveTo(projected[i].px, projected[i].py)
          ctx.lineTo(projected[i + 1].px, projected[i + 1].py)
          ctx.stroke()
        }
      }

      projected.forEach((pt) => {
        ctx.fillStyle = pt.color
        ctx.globalAlpha = pt.alpha
        ctx.shadowColor = pt.color
        ctx.shadowBlur = 6
        ctx.beginPath()
        ctx.arc(pt.px, pt.py, pt.size, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      })
      ctx.globalAlpha = 1
      animId = requestAnimationFrame(render)
    }

    render()
    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animId)
    }
  }, [isSearching])

  // ── HOLODECK FULLSCREEN CANVAS ──────────────────────────────────────────────
  useEffect(() => {
    if (!isHolodeckOpen) return
    const canvas = holodeckCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Size canvas to fill window exactly
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight - 100) // subtract header+footer height approx

    const handleResize = () => {
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight - 100
    }
    window.addEventListener('resize', handleResize)

    // Mouse drag orbit
    const onMouseDown = (e: MouseEvent) => {
      mouseOrbitRef.current.isDragging = true
      mouseOrbitRef.current.startX = e.clientX
      mouseOrbitRef.current.startY = e.clientY
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!mouseOrbitRef.current.isDragging) return
      mouseOrbitRef.current.rotY += (e.clientX - mouseOrbitRef.current.startX) * 0.008
      mouseOrbitRef.current.rotX += (e.clientY - mouseOrbitRef.current.startY) * 0.008
      mouseOrbitRef.current.startX = e.clientX
      mouseOrbitRef.current.startY = e.clientY
    }
    const onMouseUp = () => { mouseOrbitRef.current.isDragging = false }
    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    // Generate points per mode
    const numPoints = 180
    const points = Array.from({ length: numPoints }).map((_, idx) => {
      let x = 0, y = 0, z = 0, color = '#f59e0b', clusterName = ''

      if (holoMode === 'domain') {
        const clusterId = idx % 4
        const a = Math.random() * Math.PI * 2
        const r = Math.random() * 55
        const spread = (Math.random() - 0.5) * 40
        if (clusterId === 0) { x = 110 + r * Math.cos(a); y = -80 + r * Math.sin(a); z = spread; color = '#f59e0b'; clusterName = 'Food Science' }
        else if (clusterId === 1) { x = -110 + r * Math.cos(a); y = -80 + r * Math.sin(a); z = spread; color = '#10b981'; clusterName = 'Botany / Vascular' }
        else if (clusterId === 2) { x = -110 + r * Math.cos(a); y = 80 + r * Math.sin(a); z = spread; color = '#38bdf8'; clusterName = 'Atmospheric Physics' }
        else { x = 110 + r * Math.cos(a); y = 80 + r * Math.sin(a); z = spread; color = '#a855f7'; clusterName = 'Industrial Milling' }
      } else if (holoMode === 'heatmap') {
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(Math.random() * 2 - 1)
        const dist = idx < 15 ? 25 + Math.random() * 35 : idx < 45 ? 65 + Math.random() * 55 : 125 + Math.random() * 110
        x = dist * Math.sin(phi) * Math.cos(theta)
        y = dist * Math.sin(phi) * Math.sin(theta)
        z = dist * Math.cos(phi)
        color = idx < 15 ? '#ef4444' : idx < 45 ? '#f59e0b' : idx < 90 ? '#10b981' : idx < 135 ? '#38bdf8' : '#6366f1'
      } else {
        // PCA 3D grid
        x = ((idx % 7) - 3) * 38 + (Math.random() - 0.5) * 14
        y = (Math.floor((idx / 7) % 7) - 3) * 38 + (Math.random() - 0.5) * 14
        z = (Math.floor(idx / 49) - 1.5) * 70 + (Math.random() - 0.5) * 14
        color = x > 0 ? (y > 0 ? '#ec4899' : '#38bdf8') : (y > 0 ? '#a855f7' : '#10b981')
      }

      return { id: `vec-${idx}`, x, y, z, color, clusterName }
    })

    let autoAngle = 0
    let animId: number

    const renderHolodeck = () => {
      autoAngle += 0.01
      const totalAngleY = autoAngle + mouseOrbitRef.current.rotY
      const totalAngleX = mouseOrbitRef.current.rotX

      // Re-read dimensions in case of resize
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2, cy = h / 2

      // Background grid
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.04)'
      ctx.lineWidth = 1
      for (let gx = 0; gx < w; gx += 45) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke()
      }

      // ── DOMAIN MODE labels ──
      if (holoMode === 'dimensions') {
        const cosY = Math.cos(totalAngleY), sinY = Math.sin(totalAngleY)
        const cosX = Math.cos(totalAngleX), sinX = Math.sin(totalAngleX)
        const proj3 = (ax: number, ay: number, az: number) => {
          const xRot = ax * cosY - az * sinY
          let zRot = ax * sinY + az * cosY
          const yRot = ay * cosX - zRot * sinX
          zRot = ay * sinX + zRot * cosX
          const scale = 340 / (340 + zRot + 120)
          return { px: cx + xRot * scale, py: cy + yRot * scale }
        }
        const o = proj3(0, 0, 0)
        const xa = proj3(160, 0, 0), ya = proj3(0, 160, 0), za = proj3(0, 0, 160)
        const drawAxis = (to: { px: number; py: number }, col: string, label: string) => {
          ctx.strokeStyle = col; ctx.lineWidth = 2
          ctx.beginPath(); ctx.moveTo(o.px, o.py); ctx.lineTo(to.px, to.py); ctx.stroke()
          ctx.fillStyle = col; ctx.font = '11px monospace'
          ctx.fillText(label, to.px + 5, to.py)
        }
        drawAxis(xa, '#ec4899', 'PC1 (Lexical Dim)')
        drawAxis(ya, '#38bdf8', 'PC2 (Semantic Context)')
        drawAxis(za, '#a855f7', 'PC3 (Cross-Lingual)')
      }

      // ── PROJECT ALL POINTS ──
      const projected = points.map((p) => {
        const cosY = Math.cos(totalAngleY), sinY = Math.sin(totalAngleY)
        const xRot = p.x * cosY - p.z * sinY
        let zRot = p.x * sinY + p.z * cosY
        const cosX = Math.cos(totalAngleX), sinX = Math.sin(totalAngleX)
        const yRot = p.y * cosX - zRot * sinX
        zRot = p.y * sinX + zRot * cosX
        const scale = 340 / (340 + zRot + 120)
        return {
          ...p,
          px: cx + xRot * scale,
          py: cy + yRot * scale,
          size: Math.max(1.8, 4.8 * scale),
          alpha: Math.min(1, Math.max(0.2, (zRot + 200) / 400))
        }
      })

      // Constellation links
      if (holoMode !== 'heatmap') {
        ctx.strokeStyle = holoMode === 'domain' ? 'rgba(245,158,11,0.12)' : 'rgba(168,85,247,0.14)'
        ctx.lineWidth = 0.9
        for (let i = 0; i < projected.length; i += 2) {
          if (projected[i + 1]) {
            ctx.beginPath()
            ctx.moveTo(projected[i].px, projected[i].py)
            ctx.lineTo(projected[i + 1].px, projected[i + 1].py)
            ctx.stroke()
          }
        }
      }

      // ── HEATMAP: thermal gradient + concentric rings ──
      if (holoMode === 'heatmap') {
        const heatGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 230)
        heatGrad.addColorStop(0, 'rgba(239,68,68,0.28)')
        heatGrad.addColorStop(0.3, 'rgba(245,158,11,0.16)')
        heatGrad.addColorStop(0.65, 'rgba(16,185,129,0.08)')
        heatGrad.addColorStop(1, 'rgba(99,102,241,0.01)')
        ctx.fillStyle = heatGrad
        ctx.beginPath(); ctx.arc(cx, cy, 230, 0, Math.PI * 2); ctx.fill()

        const ringColors = ['rgba(239,68,68,0.45)', 'rgba(245,158,11,0.3)', 'rgba(16,185,129,0.2)', 'rgba(99,102,241,0.15)']
        const ringLabels = ['0.95 (Hot Match)', '0.85 (High Sim)', '0.65 (Medium)', '0.40 (Cold/Distant)']
        const ringLabelColors = ['#ef4444', '#f59e0b', '#10b981', '#818cf8']
        ;[50, 110, 170, 230].forEach((r, idx) => {
          ctx.strokeStyle = ringColors[idx]; ctx.lineWidth = 1.2; ctx.setLineDash([4, 4])
          ctx.beginPath(); ctx.arc(cx, cy, r + Math.sin(autoAngle * 2 + idx) * 3, 0, Math.PI * 2); ctx.stroke()
          ctx.setLineDash([])
          ctx.fillStyle = ringLabelColors[idx]; ctx.font = '8px monospace'
          ctx.fillText(ringLabels[idx], cx + r - 30, cy - 6)
        })

        // Central anchor
        ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 14
        ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2); ctx.fill()
        ctx.shadowBlur = 0
        ctx.fillStyle = '#fde047'; ctx.font = '10px monospace'
        ctx.fillText('★ ACTIVE QUERY VECTOR', cx + 8, cy + 3)
      }

      // ── DRAW ALL NODES ──
      projected.forEach((pt) => {
        if (holoMode === 'heatmap' && (pt.color === '#ef4444' || pt.color === '#f59e0b')) {
          ctx.fillStyle = pt.color === '#ef4444' ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.25)'
          ctx.beginPath(); ctx.arc(pt.px, pt.py, pt.size * 2.8, 0, Math.PI * 2); ctx.fill()
        }
        ctx.fillStyle = pt.color
        ctx.globalAlpha = pt.alpha
        ctx.shadowColor = pt.color; ctx.shadowBlur = 7
        ctx.beginPath(); ctx.arc(pt.px, pt.py, pt.size, 0, Math.PI * 2); ctx.fill()
        ctx.shadowBlur = 0
      })
      ctx.globalAlpha = 1

      // ── DOMAIN: floating cluster labels in 3D space ──
      if (holoMode === 'domain') {
        const drawLabel = (name: string, col: string, lx: number, ly: number, lz: number) => {
          const cosY = Math.cos(totalAngleY), sinY = Math.sin(totalAngleY)
          const xRot = lx * cosY - lz * sinY
          let zRot = lx * sinY + lz * cosY
          const cosX = Math.cos(totalAngleX), sinX = Math.sin(totalAngleX)
          const yRot = ly * cosX - zRot * sinX
          zRot = ly * sinX + zRot * cosX
          const scale = 340 / (340 + zRot + 120)
          ctx.fillStyle = col; ctx.font = 'bold 11px monospace'
          ctx.shadowColor = col; ctx.shadowBlur = 8
          ctx.fillText(`✦ ${name}`, cx + xRot * scale - 35, cy + yRot * scale - 18)
          ctx.shadowBlur = 0
        }
        drawLabel('Food Science', '#f59e0b', 110, -80, 0)
        drawLabel('Botany / Vascular', '#10b981', -110, -80, 0)
        drawLabel('Atmospheric Physics', '#38bdf8', -110, 80, 0)
        drawLabel('Industrial Milling', '#a855f7', 110, 80, 0)
      }

      // ── HEATMAP: thermal legend bar bottom-right ──
      if (holoMode === 'heatmap') {
        const lx = w - 220, ly = h - 35, lw = 190, lh = 8
        const legGrad = ctx.createLinearGradient(lx, 0, lx + lw, 0)
        legGrad.addColorStop(0, '#6366f1'); legGrad.addColorStop(0.35, '#38bdf8')
        legGrad.addColorStop(0.65, '#10b981'); legGrad.addColorStop(0.85, '#f59e0b')
        legGrad.addColorStop(1, '#ef4444')
        ctx.fillStyle = legGrad; ctx.fillRect(lx, ly, lw, lh)
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.strokeRect(lx, ly, lw, lh)
        ctx.fillStyle = '#94a3b8'; ctx.font = '9px monospace'
        ctx.fillText('0.0 (Cold/Distant)', lx, ly - 4)
        ctx.fillText('0.98 (Hot Match 🔥)', lx + lw - 100, ly - 4)
      }

      animId = requestAnimationFrame(renderHolodeck)
    }

    renderHolodeck()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isHolodeckOpen, holoMode])

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Bento card */}
      <div className={`relative flex flex-col rounded-xl border border-amber-500/20 bg-slate-950/70 backdrop-blur-xl overflow-hidden shadow-xl p-5 ${className}`}>
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
        <div className="flex items-center justify-between mb-2 z-10">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b] animate-pulse" />
            <h3 className="text-xs font-mono font-semibold tracking-widest text-amber-500 uppercase">3D VECTOR COSMOS</h3>
          </div>
          <button onClick={() => setIsHolodeckOpen(true)} className="flex items-center gap-1.5 text-[11px] font-mono text-amber-400/80 hover:text-amber-300 bg-slate-900/60 border border-amber-500/20 hover:border-amber-400/40 px-2.5 py-1 rounded-lg transition-all cursor-pointer">
            <Maximize2 size={12} /> Holodeck
          </button>
        </div>
        <div className="relative w-full rounded-lg overflow-hidden border border-slate-800/60 bg-[#03060a] cursor-pointer" style={{ height: 190 }} onClick={() => setIsHolodeckOpen(true)}>
          <canvas ref={cosmosCanvasRef} className="w-full h-full" />
          <div className="absolute bottom-2 left-2 pointer-events-none text-[9px] font-mono text-slate-500/70">Click to Expand 3D Space ↗</div>
        </div>
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-900/80 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_6px_#f59e0b] animate-pulse" />
            <span className="text-slate-300 font-medium">778,650 Points</span>
            <span className="text-slate-600">•</span>
            <span>384 Dim MiniLM</span>
          </div>
          <span className="text-amber-500/70">QDRANT / ECHO-SIGHT</span>
        </div>
      </div>

      {/* ── FULLSCREEN HOLODECK via Portal (escapes Framer Motion transform context) ── */}
      {isHolodeckOpen && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', background: '#020408', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 24px', borderBottom: '1px solid rgba(245,158,11,0.2)', background: '#03060c', flexShrink: 0, gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(245,158,11,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 10px #f59e0b' }} />
              </span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.1em', color: '#f59e0b', textTransform: 'uppercase' }}>3D VECTOR HOLODECK // INTERACTIVE SPACE ORBIT</span>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', padding: '2px 8px', borderRadius: 99, background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}>• DRAG TO ROTATE</span>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace', marginTop: 2 }}>778,650 Dense Vectors • 384 Dimensions • MSMARCO-XI Indic Index</div>
              </div>
            </div>

            {/* 3 Mode Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(51,65,85,0.8)', borderRadius: 12, padding: 4 }}>
              {([
                { key: 'domain' as HoloMode, label: '🪐 Domain Clusters' },
                { key: 'heatmap' as HoloMode, label: '🔥 Cosine Heatmap' },
                { key: 'dimensions' as HoloMode, label: '🌐 3D Dimensional' },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setHoloMode(key)}
                  style={{
                    padding: '6px 16px', borderRadius: 8, border: holoMode === key ? '1px solid rgba(245,158,11,0.5)' : '1px solid transparent',
                    cursor: 'pointer', transition: 'all 0.2s',
                    background: holoMode === key ? 'rgba(245,158,11,0.2)' : 'transparent',
                    color: holoMode === key ? '#fbbf24' : '#94a3b8',
                    fontFamily: 'monospace', fontSize: 12, fontWeight: holoMode === key ? 700 : 400,
                    boxShadow: holoMode === key ? '0 0 12px rgba(245,158,11,0.25)' : 'none',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <button onClick={() => setIsHolodeckOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 10, background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(51,65,85,0.8)', color: '#cbd5e1', fontFamily: 'monospace', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
              <Minimize2 size={13} /> Close Holodeck
            </button>
          </div>

          {/* Sub-bar descriptor */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 24px', background: '#040810', borderBottom: '1px solid rgba(30,41,59,0.8)', fontSize: 11, fontFamily: 'monospace', flexShrink: 0 }}>
            {holoMode === 'domain' && (<><span style={{ color: '#f59e0b', fontWeight: 700 }}>🪐 DOMAIN CLUSTERS</span><span style={{ color: '#64748b' }}>Visualizes 778K chunks physically separated into 4 distinct semantic subject-matter galaxies.</span><span style={{ color: '#f59e0b', fontWeight: 700 }}>4 Spatial Domains</span></>)}
            {holoMode === 'heatmap' && (<><span style={{ color: '#fb923c', fontWeight: 700 }}>🔥 COSINE HEATMAP</span><span style={{ color: '#64748b' }}>Thermal similarity radiance measuring cosine distance from the active query vector.</span><span style={{ color: '#f59e0b', fontWeight: 700 }}>Thermal Contours: 0.95 → 0.40</span></>)}
            {holoMode === 'dimensions' && (<><span style={{ color: '#c084fc', fontWeight: 700 }}>🌐 3D DIMENSIONAL PCA</span><span style={{ color: '#64748b' }}>3-Axis Cartesian projection (PC1, PC2, PC3) of 384-dimensional dense MiniLM vector space.</span><span style={{ color: '#f59e0b', fontWeight: 700 }}>Axes: X (Lexical) • Y (Context) • Z (Indic)</span></>)}
          </div>

          {/* Canvas fills all remaining height */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: 'grab', minHeight: 0 }}>
            <canvas ref={holodeckCanvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 24px', borderTop: '1px solid rgba(30,41,59,0.8)', background: '#03060c', fontSize: 11, fontFamily: 'monospace', color: '#475569', flexShrink: 0 }}>
            <span>Drag cursor across viewport to rotate 3D cluster constellation in real time</span>
            <span style={{ color: '#f59e0b', fontWeight: 700 }}>NEAREST NEIGHBOR COSINE: 0.853 (74ms)</span>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

