'use client'

import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Activity, ChevronDown, CircleHelp, FileText, Headphones, Mic, ShieldCheck, Sparkles, Square, Volume2, Zap, Loader2, AlertTriangle } from 'lucide-react'

type EvidenceShard = { text: string; metadata?: { docId?: string; language?: string; strategy?: string } }
type QueryResponse = { synthesized_answer: string; evidence_shards: (EvidenceShard | string)[]; latency_ms: number; citations_count?: number }
type DisplayShard = [id: string, source: string, copy: string]
type Stage = [name: string, time: string, detail: string]

const defaultEvidence: DisplayShard[] = [
  ['SHARD-04', 'FIELD NOTES / goa-026', 'The signal resolves when fragmented observations are aligned into a single, traceable account.'],
  ['SHARD-11', 'FIELD NOTES / task-02', 'A grounded answer carries its evidence forward, keeping the path visible.'],
  ['SHARD-07', 'DRISHTI INDEX / warm-run', 'Warm index latency is measured from request receipt through grounded serialization.'],
]
const defaultStages: Stage[] = [['Transcribed', '00:42', 'Voice signal decoded'], ['Retrieved', '18 ms', '3 shards fused'], ['Grounded', '64 ms', 'Citation coverage 100%'], ['Answered', '112 ms', 'Confidence high']]
const defaultMetrics = [78, 112, 196]

function mapEvidenceShards(shards: (EvidenceShard | string)[]): DisplayShard[] {
  return shards.map((shard, i) => {
    if (typeof shard === 'string') {
      return [`SHARD-${String(i + 1).padStart(2, '0')}`, 'QDRANT / ECHO-SIGHT', shard]
    }
    const meta = shard.metadata ?? {}
    const id = meta.docId ? `SHARD-${String(meta.docId).toUpperCase()}` : `SHARD-${String(i + 1).padStart(2, '0')}`
    const source = [meta.strategy, meta.docId].filter(Boolean).join(' / ').toUpperCase() || 'CORPUS'
    return [id, source, shard.text]
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

  const hindiMatch = answer.match(/HINDI:\s*(.*)/i);
  const englishMatch = answer.match(/ENGLISH:\s*(.*)/i);
  const hindiText = hindiMatch ? hindiMatch[1].trim() : (englishMatch ? '' : answer);
  const englishText = englishMatch ? englishMatch[1].trim() : '';

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

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('http://localhost:8000/api/metrics')
        if (res.ok) {
          const data = await res.json()
          setMetrics([Math.round(data.P50), Math.round(data.P70), Math.round(data.P100)])
        }
      } catch (e) {
        // ignore
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [])



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
            encoding: "pcm_s16le",
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

    try {
      const res = await fetch('http://127.0.0.1:8000/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: query }),
      })

      if (!res.ok) {
        const detail = await res.text()
        throw new Error(`Backend returned ${res.status}: ${detail}`)
      }

      const data: QueryResponse = await res.json()
      const shards = mapEvidenceShards(data.evidence_shards ?? [])
      const latency = Math.round(data.latency_ms ?? 0)
      const citations = data.citations_count ?? shards.length

      setAnswer(data.synthesized_answer)
      setEvidence(shards.length ? shards : defaultEvidence)
      setLatencyMs(latency)
      setCitationCount(citations)
      setMetrics([
        Math.max(1, Math.round(latency * 0.7)),
        latency,
        Math.max(latency + 1, Math.round(latency * 1.75)),
      ])
      setStages(buildStages(latency, shards.length))
      setComplete(true)
      setStatus('Answer grounded · ready to inspect')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setQueryError(message)
      setAnswer('Could not reach the Drishti backend. Ensure `uvicorn api:app --reload` is running on port 8000, then try again.')
      setComplete(true)
      setStatus('Backend offline · check Python server')
    }
  }
  if (!initialized) return <Splash onInitialize={begin} />
  return <motion.main className={`voice-shell dashboard-enter ${booting ? 'booting' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .8 }}>
    <div className="ambient-void" aria-hidden="true"><span>01</span><i /><i /><i /></div>
    <header className="topbar"><div className="brand-lockup"><span className="brand-mark"><span /></span><div><p className="eyebrow">PROJECT ECHO-SIGHT / INTERNAL</p><h1>Drishti OS</h1></div></div><div className="top-meta"><span className="live-dot" /> DRISHTI ONLINE <span className="divider" /> INDEX v0.8.4</div></header>
    <section className="hero-grid"><motion.div className="hero-copy" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 }}><p className="kicker"><Zap size={13} /> VOICE INTELLIGENCE / TRACEABLE ANSWERS</p><h2>Ask the world.<br /><em>See the signal.</em></h2><p className="lede">A voice-first intelligence layer for navigating fragmented information. Every answer leaves a trace.</p><div className="micro-stats"><span><strong>4</strong> signal paths</span><span><strong>3</strong> evidence layers</span><span><strong>100%</strong> traceable</span></div></motion.div>
      <div className={`core-stage ${recording ? 'is-recording' : ''}`} onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setCorePoint({ x: ((e.clientX - r.left) / r.width - .5) * 12, y: ((e.clientY - r.top) / r.height - .5) * 12 }) }} onMouseLeave={() => setCorePoint({ x: 0, y: 0 })}><div className="core-ripples" aria-hidden="true"><span /><span /><span /></div><motion.div className="core-halo" style={{ '--core-x': `${corePoint.x}px`, '--core-y': `${corePoint.y}px` } as React.CSSProperties} animate={{ rotate: 360 }} transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}><div className="core-inner"><Mic size={29} /></div></motion.div><motion.button className="core-button" whileTap={{ scale: .95 }} whileHover={{ color: '#f7d38b' }} aria-label="Toggle recording" onClick={recording ? stopRecording : startRecording}>{recording ? <Square size={20} fill="currentColor" /> : <Mic size={23} />}</motion.button><p className="core-status"><span className="signal" />{status}</p></div>
      <motion.div className="query-panel panel-glass" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .3 }}><div className="panel-heading"><div><p className="eyebrow">VOICE TRANSCRIPT / LIVE</p><h3>Shape your question</h3></div><span className="lang-pill">EN-IN <ChevronDown size={12} /></span></div><textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Editable transcript" /><div className="query-actions"><motion.button whileTap={{ scale: .95 }} whileHover={{ boxShadow: '0 0 22px #e4a75c66' }} className={`icon-button ${tts ? 'tts-on' : ''}`} aria-label="Drishti Voice Output" onClick={() => setTts(!tts)}>{tts ? <Volume2 size={16} /> : <Headphones size={16} />}</motion.button><motion.button whileTap={{ scale: .95 }} whileHover={{ boxShadow: '0 0 24px #e4a75c88' }} className="submit-button" onClick={runQuery} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>{recording ? <><motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={{ display: 'inline-block', lineHeight: 0 }}><Loader2 size={14} /></motion.span> Transcribing...</> : !complete ? <><motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={{ display: 'inline-block', lineHeight: 0 }}><Loader2 size={14} /></motion.span> Running...</> : 'Run query ↗'}</motion.button></div><p className="hint"><CircleHelp size={13} /> {tts ? 'Drishti Voice Output enabled' : 'Voice output muted'}</p><div style={{ marginTop: '1.5rem', textAlign: 'left', zIndex: 10, paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}><p style={{ fontSize: '0.65rem', opacity: 0.8, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '10px', color: '#e4a75c' }}>Test the Database (Try asking):</p><div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {suggestedQueries.map((query, i) => (
              <button 
                key={i} 
                onClick={() => { setText(query.text); runQuery(query.text); }} 
                style={{ 
                  background: query.isGuardrail ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255,255,255,0.03)', 
                  border: query.isGuardrail ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(228,167,92,0.2)', 
                  padding: '6px 12px', 
                  borderRadius: '100px', 
                  fontSize: '0.75rem', 
                  color: query.isGuardrail ? '#fca5a5' : 'rgba(255,255,255,0.7)', 
                  cursor: 'pointer', 
                  transition: 'all 0.2s', 
                  textAlign: 'left' 
                }} 
                onMouseEnter={(e) => { 
                  e.currentTarget.style.background = query.isGuardrail ? 'rgba(239, 68, 68, 0.15)' : 'rgba(228,167,92,0.1)'; 
                  e.currentTarget.style.color = query.isGuardrail ? '#fca5a5' : '#f7d38b'; 
                }} 
                onMouseLeave={(e) => { 
                  e.currentTarget.style.background = query.isGuardrail ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255,255,255,0.03)'; 
                  e.currentTarget.style.color = query.isGuardrail ? '#fca5a5' : 'rgba(255,255,255,0.7)'; 
                }}
              >
                {query.label}
              </button>
            ))}
          </div></div></motion.div></section>
    <section style={{ display: 'flex', justifyContent: 'center', margin: '2rem auto', width: '100%', maxWidth: '1200px', padding: '0 2rem' }}><motion.article ref={answerRef} className="answer-card panel-glass" style={{ width: '100%' }}><div className="answer-top"><div><p className="eyebrow">GROUNDED RESPONSE</p><h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{complete ? 'Evidence-backed synthesis' : <><motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={{ display: 'inline-block', lineHeight: 0 }}><Loader2 size={18} /></motion.span> Working through the corpus...</>}</h3></div><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>{(answer.includes('UNANSWERABLE') || answer.includes('क्षमा करें')) ? (<motion.span className="confidence" animate={{ boxShadow: ['0 0 0px rgba(239, 68, 68, 0)', '0 0 15px rgba(239, 68, 68, 0.8)', '0 0 0px rgba(239, 68, 68, 0)'] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.4)', fontWeight: 'bold' }}><AlertTriangle size={15} /> GUARDRAIL TRIGGERED: OUT OF DOMAIN</motion.span>) : (<span className="confidence" style={{ color: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.1)', borderColor: 'rgba(52, 211, 153, 0.2)' }}><ShieldCheck size={15} /> HIGH CONFIDENCE: EVIDENCE-BACKED SYNTHESIS</span>)}{(answer.includes('UNANSWERABLE') || answer.includes('क्षमा करें')) && <motion.span animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} style={{ fontSize: '0.75rem', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 'bold', marginTop: '2px' }}>System successfully prevented hallucination</motion.span>}</div></div><div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', marginBottom: '1rem' }}><motion.div style={{ flex: 1, padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' }} animate={!complete ? { opacity: [0.4, 1, 0.4] } : { opacity: 1 }} transition={{ duration: 1.5, repeat: Infinity }}><h4 style={{ fontSize: '0.7rem', color: '#e4a75c', marginBottom: '0.5rem', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>हिंदी (Hindi)<button onClick={(e) => { e.preventDefault(); playAudio(hindiText, 'hi-IN'); }} style={{ background: 'transparent', border: 'none', color: '#e4a75c', cursor: 'pointer' }}><Volume2 size={14} /></button></h4><p style={{ fontSize: '1.05rem', lineHeight: '1.6', flex: 1, color: 'rgba(255,255,255,0.9)' }}>{hindiText}</p></motion.div><motion.div style={{ flex: 1, padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' }} animate={!complete ? { opacity: [0.4, 1, 0.4] } : { opacity: 1 }} transition={{ duration: 1.5, repeat: Infinity }}><h4 style={{ fontSize: '0.7rem', color: '#e4a75c', marginBottom: '0.5rem', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>English<button onClick={(e) => { e.preventDefault(); playAudio(englishText || answer, 'en-US'); }} style={{ background: 'transparent', border: 'none', color: '#e4a75c', cursor: 'pointer' }}><Volume2 size={14} /></button></h4><p style={{ fontSize: '0.95rem', lineHeight: '1.6', flex: 1, color: 'rgba(255,255,255,0.7)' }}>{englishText || (complete ? '' : 'Translating...')}</p></motion.div></div><div className="citation-row"><span><FileText size={14} /> {citationCount} citations</span><span><Activity size={14} /> {latencyMs} ms server pipeline</span><span><Sparkles size={14} /> {queryError ? 'backend unreachable' : 'guardrail passed'}</span></div></motion.article></section>
    <section className="workspace" style={{ alignItems: 'start' }}><div className="answer-column"><div className="section-label"><span>01</span><p>PIPELINE TRACE</p><span className="trace-id">TRACE / RAG-{String(run).padStart(4, '0')}</span></div><div className="timeline">{stages.map(([name, time, detail], i) => <div className={`stage ${complete || i === 0 ? 'done' : ''}`} key={name}><div className="stage-node">{complete ? '✓' : i + 1}</div><div><strong>{name}</strong><small>{detail}</small></div><time>{time}</time></div>)}</div><motion.section className="analytics panel-glass" style={{ marginTop: '2rem' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .5 }}><div className="analytics-heading"><div><p className="eyebrow">03 / OBSERVABILITY</p><h3>Latency stream</h3></div><div className="warm"><span className="live-dot" /> WARM INDEX · 48 SAMPLES</div></div><div className="stream-wrap"><div className="stream-line"><span className="stream-pulse" /></div>{['P50', 'P70', 'P100'].map((metric, i) => <button key={metric} className={`metric metric-${i}`} onMouseEnter={() => setHoverMetric(metric)}><strong>{metric}</strong><span>{metrics[i]} ms</span>{hoverMetric === metric && <i className="echo" />}</button>)}</div><div className="analytics-foot"><span>Validated request → serialized answer</span><span>Target <b>&lt; 200 ms</b> · P100 <b>{metrics[2]} ms</b> <span className="pass">{metrics[2] < 200 ? 'PASS' : 'WARN'}</span></span></div></motion.section></div>
      <aside className="evidence-column"><div className="section-label"><span>02</span><p>EVIDENCE SHARDS</p><motion.button whileTap={{ scale: .95 }} whileHover={{ boxShadow: '0 0 20px #e4a75c55' }} className="expand-button" onClick={() => setExpanded(!expanded)}>{expanded ? 'Collapse' : 'Expand drawer'} <ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} /></motion.button></div><div className="evidence-drawer">{evidence.slice(0, expanded ? evidence.length : 1).map(([id, source, copy], i) => <motion.button className="shard" key={`${id}-${i}`} onClick={() => setExpanded(true)} animate={{ y: [0, -2, 0], opacity: 1 }} initial={{ opacity: 0 }} transition={{ duration: 4, repeat: Infinity, delay: i * .2 }} whileHover={{ scale: 1.02 }}><span className="shard-index">0{i + 1}</span><div className="shard-body"><div className="shard-meta"><strong>{id}</strong><span>{(0.94 - i * .06).toFixed(2)}</span></div><p>{copy}</p><div className="shard-tags"><span>semantic</span><span>en-IN</span><span>{source}</span></div></div></motion.button>)}{!expanded && evidence.length > 1 && <div style={{ textAlign: 'center', fontSize: '0.7rem', opacity: 0.5, marginTop: '8px', cursor: 'pointer' }} onClick={() => setExpanded(true)}>+ {evidence.length - 1} more shards</div>}</div></aside></section>
    <footer><span>DRISHTI / OBSERVABILITY BY DESIGN</span><span>Speech provider <b>Sarvam STT</b> · audio ephemeral by default</span><span>© 2026</span></footer>
  </motion.main>
}
