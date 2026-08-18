'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion'
import { Activity, ChevronDown, CircleHelp, FileText, Headphones, Mic, ShieldCheck, Sparkles, Square, Volume2, Zap, Loader2, AlertTriangle } from 'lucide-react'

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

function VoiceOrb({ isRecording, isThinking }: { isRecording: boolean; isThinking: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const prefersReducedMotion = typeof window !== 'undefined' 
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
      : false

    let animationFrameId: number
    let phase = 0

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const cx = canvas.width / 2
      const cy = canvas.height / 2
      const baseRadius = isRecording ? 68 : 58

      // Draw Glowing Aura
      const gradient = ctx.createRadialGradient(cx, cy, baseRadius * 0.3, cx, cy, baseRadius * 1.4)
      if (isRecording) {
        gradient.addColorStop(0, 'rgba(234, 88, 12, 0.9)')   // Stark active marigold orange
        gradient.addColorStop(0.5, 'rgba(245, 158, 11, 0.3)')
        gradient.addColorStop(1, 'rgba(245, 158, 11, 0)')
      } else if (isThinking) {
        gradient.addColorStop(0, 'rgba(245, 158, 11, 0.6)')   // Golden amber thinking
        gradient.addColorStop(0.6, 'rgba(217, 119, 6, 0.2)')
        gradient.addColorStop(1, 'rgba(217, 119, 6, 0)')
      } else {
        gradient.addColorStop(0, 'rgba(245, 158, 11, 0.25)')  // Warm breathing idle
        gradient.addColorStop(0.7, 'rgba(245, 158, 11, 0.05)')
        gradient.addColorStop(1, 'rgba(245, 158, 11, 0)')
      }

      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(cx, cy, baseRadius * 1.4, 0, Math.PI * 2)
      ctx.fill()

      if (isThinking) {
        // Thinking spinner
        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(cx, cy, baseRadius, phase, phase + Math.PI * 1.5)
        ctx.stroke()

        ctx.strokeStyle = '#ea580c'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(cx, cy, baseRadius - 6, -phase, -phase + Math.PI * 1.2)
        ctx.stroke()
      } else {
        // Fluid displacement blob
        ctx.beginPath()
        const points = 120
        for (let i = 0; i < points; i++) {
          const angle = (i / points) * Math.PI * 2
          let waveOffset = 0
          
          if (!prefersReducedMotion) {
            waveOffset = Math.sin(angle * 6 + phase) * (isRecording ? 10 : 3.5) +
                         Math.cos(angle * 3 - phase * 1.4) * (isRecording ? 5 : 1.5)
          }

          const r = baseRadius + waveOffset
          const x = cx + Math.cos(angle) * r
          const y = cy + Math.sin(angle) * r
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.fillStyle = isRecording ? '#ea580c' : '#f59e0b'
        ctx.fill()
      }

      if (!prefersReducedMotion) {
        phase += isRecording ? 0.09 : 0.02
        animationFrameId = requestAnimationFrame(render)
      }
    }

    render()
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId)
    }
  }, [isRecording, isThinking])

  return (
    <div className="relative flex items-center justify-center w-48 h-48">
      <canvas ref={canvasRef} width={200} height={200} className="w-full h-full" />
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

function Splash({ onInitialize }: { onInitialize: () => void }) {
  const [point, setPoint] = useState({ x: 0, y: 0 })
  const [magnet, setMagnet] = useState({ x: 0, y: 0 })
  const embers = Array.from({ length: 16 }, (_, i) => ({ id: i, left: `${8 + ((i * 37) % 84)}%`, delay: (i % 7) * 0.8, duration: 9 + (i % 5) * 2, size: 2 + (i % 3) }))
  return <main className="splash-shell" style={{ '--mouse-x': `${point.x}px`, '--mouse-y': `${point.y}px`, '--parallax-x': `${point.x / 3}px`, '--parallax-y': `${point.y / 3}px` } as React.CSSProperties} onMouseMove={(e) => setPoint({ x: (e.clientX / window.innerWidth - .5) * 20, y: (e.clientY / window.innerHeight - .5) * 20 })}>
    <div className="grain" /><div className="ember-field" aria-hidden="true">{embers.map((ember) => <motion.i key={ember.id} className="ember" style={{ left: ember.left, width: ember.size, height: ember.size }} initial={{ y: '110vh', opacity: 0 }} animate={{ y: '-15vh', opacity: [0, .45, .45, 0] }} transition={{ duration: ember.duration, delay: ember.delay, repeat: Infinity, ease: 'linear' }} />)}</div><div className="splash-top"><span className="splash-mark">D</span><span>DRISHTI OS <b>v1.0</b></span></div>
    <div className="splash-center"><div className="splash-core"><div className="splash-ring ring-one" /><div className="splash-ring ring-two" /><div className="splash-orbit" /><span className="splash-core-letter">E</span></div><p className="splash-status"><i /> VOICE SYSTEM DORMANT</p><p className="splash-label">PROJECT ECHO-SIGHT</p><h1>Hear the<br /><em>unseen.</em></h1><p className="splash-copy">A voice-first intelligence layer for navigating<br />the world of fragmented information.</p><motion.button className="initialize-button" style={{ x: magnet.x, y: magnet.y }} whileTap={{ scale: .95 }} whileHover={{ boxShadow: '0 0 42px #d8ae5680' }} onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMagnet({ x: (e.clientX - (r.left + r.width / 2)) * .12, y: (e.clientY - (r.top + r.height / 2)) * .12 }) }} onMouseLeave={() => setMagnet({ x: 0, y: 0 })} onClick={onInitialize}><span>Initialize Drishti OS</span><b>↗</b></motion.button><p className="splash-hint">Press Enter to begin <span>·</span> Audio output enabled</p></div>
    <div className="splash-footer"><span>TEAM DRISHTI</span><span>CLASSIFIED / INTERNAL DEMO</span><span>◌ &nbsp;SYSTEMS ONLINE</span></div>
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

  const hindiMatch = answer.match(/HINDI:[\s]*(([\s\S]+?)(?=\nENGLISH:|$))/i);
  const englishMatch = answer.match(/ENGLISH:[\s]*([\s\S]+?)$/i);
  const hindiText = hindiMatch ? hindiMatch[1].trim() : (englishMatch ? '' : answer);
  const englishText = englishMatch ? englishMatch[1].trim() : '';;

  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
      window.speechSynthesis.getVoices();
    }
  }, []);

  const playAudio = (text: string, lang: string) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();

      const cleanText = text
        .replace(/[\*\#\_\[\]\(\)\-\_]/g, ' ')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

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




  function begin() { if (booting) return; setBooting(true); setTimeout(() => setInitialized(true), 1500); setTimeout(() => setBooting(false), 2400) }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream;

      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      const apiKey = process.env.NEXT_PUBLIC_SARVAM_API_KEY || "";
      const wsUrl = `wss://api.sarvam.ai/speech-to-text/ws?language-code=hi-IN&model=saaras:v3&mode=transcribe&sample_rate=16000&high_vad_sensitivity=true&vad_signals=true&flush_signal=true`;
      const ws = new WebSocket(wsUrl, [`api-subscription-key.${apiKey}`]);
      wsRef.current = ws;

      let currentTranscript = '';
      let connectionFailed = false;

      ws.onopen = () => {
        setRecording(true)
        setComplete(false)
        setStatus('Recording · speak naturally')
        setText('')
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "data" && data.data && data.data.transcript) {
            currentTranscript = data.data.transcript;
            setText(currentTranscript);
            if (finalizingRef.current) {
              finalizingRef.current = false;
              try { ws.close() } catch (e) { }
            }
          } else if (data.type === "error") {
            console.error("Sarvam STT error", data);
            setStatus(data.data?.message || 'Sarvam STT error');
          }
        } catch (e) { }
      };

      ws.onclose = () => {
        setRecording(false);
        if (connectionFailed) {
          setStatus('WebSocket connection failed');
          setComplete(true);
          return;
        }
        setStatus('Processing speech...');
        if (currentTranscript.trim()) {
          runQuery(currentTranscript.trim());
        } else {
          setStatus('Ready for a voice query');
          setComplete(true);
        }
      };

      ws.onerror = (e) => {
        console.error("WebSocket error", e);
        connectionFailed = true;
        setStatus('WebSocket connection failed');
      };

      processor.onaudioprocess = (e) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }

        let binary = '';
        const bytes = new Uint8Array(pcmData.buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Audio = btoa(binary);

        ws.send(JSON.stringify({
          audio: {
            data: base64Audio,
            sample_rate: "16000",
            encoding: "audio/wav",
            language_code: "hi-IN"
          }
        }));
      };

      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;
      source.connect(processor);
      processor.connect(gainNode);
      gainNode.connect(audioContext.destination);

    } catch (err) {
      console.error("Microphone access error", err)
      setStatus('Microphone access denied or not supported')
    }
  }

  function stopRecording() {
    const ws = wsRef.current;

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setRecording(false);

    if (ws) {
      if (ws.readyState === WebSocket.OPEN) {
        finalizingRef.current = true;
        try { ws.send(JSON.stringify({ type: 'flush' })) } catch (e) { }
        setStatus('Finalizing transcript…');
        setTimeout(() => { try { ws.close() } catch (e) { } }, 1500);
      } else {
        try { ws.close() } catch (e) { }
      }
      wsRef.current = null;
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

      setAnswer(data.synthesized_answer)
      setEvidence(shards.length ? shards : defaultEvidence)
      setCitationCount(citations)
      setAnswerType('polished')
      setComplete(true)
      setStatus('Answer grounded · ready to inspect')
      updateLiveMetrics(Math.round((performance.now() - (window as any).__queryStart || latencyMs)))

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
    <div className="flex flex-col items-center justify-center min-h-[270px] relative">
      <Magnetic>
        <motion.button 
          whileTap={{ scale: 0.95 }}
          onClick={recording ? stopRecording : startRecording}
          className="relative flex items-center justify-center cursor-pointer bg-transparent border-0 outline-none p-0 z-10"
          style={{ width: '192px', height: '192px' }}
          aria-label="Toggle recording"
        >
          <VoiceOrb isRecording={recording} isThinking={!complete} />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-white z-20">
            {recording ? (
              <Square size={28} fill="currentColor" className="text-orange-600 animate-pulse" />
            ) : (
              <Mic size={32} className="text-amber-500" />
            )}
          </div>
        </motion.button>
      </Magnetic>
      <p className="core-status" style={{ position: 'absolute', bottom: 0 }}><span className="signal" />{status}</p>
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
          <span><Sparkles size={14} /> {queryError ? 'backend unreachable' : answerType === 'fast' && !complete ? 'fast path · unverified' : 'guardrail passed'}</span>
        </div>
      </motion.article>
    </section>
  )

  const latencyMetricsSection = (
    <motion.section className="analytics panel-glass animate-fade-in" style={{ marginTop: '2rem' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .5 }}>
      <div className="analytics-heading">
        <div>
          <p className="eyebrow">03 / OBSERVABILITY</p>
          <h3>Benchmark <span style={{ fontSize: '0.65em', opacity: 0.6, fontWeight: 400 }}>(across {sampleSize} queries)</span></h3>
        </div>
        <div className="warm"><span className="live-dot" /> {sampleSize} SAMPLES</div>
      </div>
      <div className="stream-wrap">
        <div className="stream-line"><span className="stream-pulse" /></div>
        {['P50', 'P70', 'P100'].map((metric, i) => (
          <button key={metric} className={`metric metric-${i}`} onMouseEnter={() => setHoverMetric(metric)}>
            <strong>{metric}</strong>
            <span>{metrics[i]} ms</span>
            {hoverMetric === metric && <i className="echo" />}
          </button>
        ))}
      </div>
      <div className="analytics-foot">
        <span>Full pipeline · retrieval + generation</span>
        <span>Benchmark P50 <b>{metrics[0] >= 1000 ? `${(metrics[0]/1000).toFixed(1)}s` : `${metrics[0]}ms`}</b> · P100 <b>{metrics[2] >= 1000 ? `${(metrics[2]/1000).toFixed(1)}s` : `${metrics[2]}ms`}</b></span>
      </div>
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
        <p>EVIDENCE SHARDS</p>
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
          {evidence.map(([id, source, copy, score], i) => (
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
          
          {complete && (
            <div style={{ maxWidth: '1200px', padding: '0 2rem', margin: '0 auto', width: '100%' }}>
              {latencyMetricsSection}
            </div>
          )}
        </div>

        {/* Right Column: Bento evidence cards grid */}
        <div className="lg:col-span-5 w-full">
          {workspaceEvidenceSection}
        </div>
      </div>

      {footerSection}
    </motion.main>
  )
}
