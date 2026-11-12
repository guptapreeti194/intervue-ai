
import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { buildUploadSession, saveUploadSession } from '../utils/uploadSessions'

// ── Types ─────────────────────────────────────────────────────────────────────

type UploadPhase =
  | 'idle'
  | 'uploading'
  | 'transcribing'
  | 'analysing_speech'
  | 'analysing_vision'
  | 'scoring'
  | 'done'
  | 'error'

type SpeechResult = {
  word_count: number
  wpm: number
  wpm_label: string
  wpm_score: number
  total_filler_count: number
  filler_details: { word: string; count: number }[]
  filler_score: number
  answer_length_label: string
  answer_length_score: number
  type_token_ratio: number
  repetition_score: number
  speech_score: number
  speech_score_formula: string
  strengths: string[]
  suggestions: string[]
  pause_analysis: { estimated_count: number; avg_duration_sec: number }
  source: string
}

type VisionResult = {
  face_visibility_pct: number
  face_visibility_score: number
  eye_contact_pct: number
  eye_contact_score: number
  eye_contact_method: string
  head_movement_label: string
  head_movement_score: number
  posture_score: number
  posture_label: string
  lighting_quality: string
  lighting_score: number
  non_verbal_score: number
  frames_analysed: number
  video_duration_sec: number
  analysis_method: string
  strengths: string[]
  suggestions: string[]
}

type CategoryResult = {
  label: string
  score: number
  weight: number
  weighted_score: number
  sub_scores: Record<string, unknown>
  strengths: string[]
  suggestions: string[]
  data_source: string
}

type UploadAnalysisResult = {
  session_id: string
  file_name: string
  file_type: string
  has_video: boolean
  has_audio: boolean
  speech: SpeechResult | null
  vision: VisionResult | null
  overall_score: number
  overall_grade: string
  overall_label: string
  categories: CategoryResult[]
  top_strength: string
  top_suggestion: string
  formula: string
  data_completeness: string
  transcript: string | null
}

const API_BASE = 'http://localhost:8000'
const MAX_FILE_MB = 200

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function phaseLabel(phase: UploadPhase): string {
  switch (phase) {
    case 'uploading': return 'Uploading file…'
    case 'transcribing': return 'Transcribing audio…'
    case 'analysing_speech': return 'Analysing speech patterns…'
    case 'analysing_vision': return 'Processing video frames…'
    case 'scoring': return 'Computing performance scores…'
    case 'done': return 'Analysis complete'
    case 'error': return 'Analysis failed'
    default: return ''
  }
}

function phasePercent(phase: UploadPhase): number {
  switch (phase) {
    case 'uploading': return 15
    case 'transcribing': return 35
    case 'analysing_speech': return 55
    case 'analysing_vision': return 75
    case 'scoring': return 90
    case 'done': return 100
    default: return 0
  }
}

// ── Score Ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const r = size / 2 - 10
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - score / 100)
  const color = score >= 70 ? '#34d399' : score >= 50 ? '#fbbf24' : '#f87171'
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="9"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 1s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <strong style={{ fontSize: size > 100 ? '2rem' : '1.3rem', color, lineHeight: 1 }}>{score}</strong>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>/ 100</span>
      </div>
    </div>
  )
}

// ── Metric Row ────────────────────────────────────────────────────────────────

function MetricBar({ label, value, max = 100, unit = '' }: { label: string; value: number; max?: number; unit?: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const color = pct >= 70 ? 'var(--green)' : pct >= 45 ? 'var(--amber)' : '#f87171'
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: '0.88rem' }}>{label}</span>
        <span style={{ fontSize: '0.85rem', color, fontWeight: 600 }}>{value}{unit}</span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 10, transition: 'width 0.8s ease' }} />
      </div>
    </div>
  )
}

// ── Upload Drop Zone ──────────────────────────────────────────────────────────

function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }, [onFile])

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? 'var(--violet)' : 'rgba(139,92,246,0.35)'}`,
        borderRadius: 20,
        padding: '60px 32px',
        textAlign: 'center',
        cursor: 'pointer',
        background: dragging ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.03)',
        transition: 'all 0.2s ease',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*,audio/*"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
      <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎬</div>
      <h3 style={{ marginBottom: 10 }}>Drop your interview recording here</h3>
      <p style={{ color: 'var(--text-dim)', marginBottom: 14 }}>
        Supports MP4, WebM, MOV, MP3, WAV, OGG · Max {MAX_FILE_MB} MB
      </p>
      <button className="btn btn-ghost" style={{ pointerEvents: 'none' }}>
        Or click to browse
      </button>
    </div>
  )
}

// ── Results Panel ─────────────────────────────────────────────────────────────

function ResultsPanel({ result }: { result: UploadAnalysisResult }) {
  const [tab, setTab] = useState<'overview' | 'speech' | 'vision' | 'transcript'>('overview')

  const tabStyle = (active: boolean) => ({
    padding: '8px 18px',
    borderRadius: 10,
    border: '1px solid ' + (active ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.09)'),
    background: active ? 'rgba(139,92,246,0.15)' : 'transparent',
    color: active ? 'var(--violet-soft)' : 'var(--text-dim)',
    cursor: 'pointer',
    fontSize: '0.88rem',
    fontFamily: 'inherit',
    transition: 'all 0.2s',
  })

  return (
    <div>
      {/* Header */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <span className="eyebrow">Analysis complete</span>
            <h2 style={{ margin: '10px 0 6px' }}>{result.file_name}</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>
              {result.file_type.startsWith('video') ? '📹 Video recording' : '🎤 Audio recording'} ·
              {' '}{result.data_completeness === 'full' ? 'Full analysis' : result.data_completeness === 'partial' ? 'Partial analysis' : 'Text-only analysis'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <ScoreRing score={result.overall_score} size={110} />
            <div>
              <div style={{
                fontSize: '2rem', fontWeight: 700,
                color: result.overall_score >= 70 ? 'var(--green)' : result.overall_score >= 50 ? 'var(--amber)' : '#f87171'
              }}>
                {result.overall_grade}
              </div>
              <div style={{ color: 'var(--text-dim)' }}>{result.overall_label}</div>
            </div>
          </div>
        </div>

        {/* Category scores */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginTop: 24 }}>
          {result.categories.map((cat) => {
            const color = cat.score >= 70 ? 'var(--green)' : cat.score >= 50 ? 'var(--amber)' : '#f87171'
            return (
              <div key={cat.label} style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 6 }}>{cat.label}</div>
                <div style={{ fontSize: '1.7rem', fontWeight: 700, color }}>{cat.score}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>weight {cat.weight}</div>
              </div>
            )
          })}
        </div>

        {/* Top insight */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 18 }}>
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', fontSize: '0.85rem' }}>
            <strong style={{ color: 'var(--green)' }}>✓ Top strength</strong>
            <p style={{ marginTop: 6, color: 'var(--text-dim)' }}>{result.top_strength}</p>
          </div>
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)', fontSize: '0.85rem' }}>
            <strong style={{ color: 'var(--amber)' }}>⚠ Priority improvement</strong>
            <p style={{ marginTop: 6, color: 'var(--text-dim)' }}>{result.top_suggestion}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        {(['overview', 'speech', 'vision', 'transcript'] as const).map((t) => (
          <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>
            {t === 'overview' ? '📊 Overview' : t === 'speech' ? '🎙️ Speech' : t === 'vision' ? '👁️ Non-Verbal' : '📝 Transcript'}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div className="card">
          <h3 style={{ marginBottom: 20 }}>Category breakdown</h3>
          {result.categories.map((cat) => (
            <div key={cat.label} style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <h4 style={{ fontSize: '0.95rem' }}>{cat.label}</h4>
                <span style={{ color: cat.score >= 70 ? 'var(--green)' : cat.score >= 50 ? 'var(--amber)' : '#f87171', fontWeight: 600 }}>{cat.score}/100</span>
              </div>
              {cat.strengths.map((s, i) => <p key={i} style={{ color: 'var(--green)', fontSize: '0.85rem', marginBottom: 4 }}>✓ {s}</p>)}
              {cat.suggestions.map((s, i) => <p key={i} style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 4 }}>→ {s}</p>)}
              <p style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: 6 }}>Data source: {cat.data_source}</p>
            </div>
          ))}
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-dim)' }}>View scoring formula</summary>
            <code style={{ display: 'block', marginTop: 10, fontSize: '0.75rem', color: 'var(--text-faint)', wordBreak: 'break-all', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 8 }}>
              {result.formula}
            </code>
          </details>
        </div>
      )}

      {/* Speech tab */}
      {tab === 'speech' && result.speech && (
        <div className="card">
          <h3 style={{ marginBottom: 20 }}>Speech & delivery metrics</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 24 }}>
            {[
              { label: 'Words Per Minute', value: result.speech.wpm, max: 200, unit: ' WPM' },
              { label: 'WPM Score', value: result.speech.wpm_score, max: 100 },
              { label: 'Filler Words', value: result.speech.total_filler_count, max: 30, unit: ' found' },
              { label: 'Filler Score', value: result.speech.filler_score, max: 100 },
              { label: 'Vocabulary Richness (TTR)', value: Math.round(result.speech.type_token_ratio * 100), max: 100, unit: '%' },
              { label: 'Repetition Score', value: result.speech.repetition_score, max: 100 },
            ].map((m) => <MetricBar key={m.label} {...m} />)}
          </div>
          <div style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, marginBottom: 18 }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: 6 }}>
              Answer length: <strong style={{ color: 'var(--text)' }}>{result.speech.word_count} words</strong>
              {' '}({result.speech.answer_length_label.replace('_', ' ')})
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
              Estimated pauses: <strong style={{ color: 'var(--text)' }}>{result.speech.pause_analysis?.estimated_count ?? '—'}</strong>
            </p>
          </div>
          {result.speech.filler_details.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: 10 }}>Filler words detected</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {result.speech.filler_details.map((f) => (
                  <span key={f.word} style={{ padding: '3px 12px', borderRadius: 20, background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', fontSize: '0.8rem', color: 'var(--amber)' }}>
                    "{f.word}" ×{f.count}
                  </span>
                ))}
              </div>
            </div>
          )}
          <h4 style={{ fontSize: '0.9rem', marginBottom: 8, color: 'var(--green)' }}>Strengths</h4>
          {result.speech.strengths.map((s, i) => <p key={i} style={{ fontSize: '0.88rem', marginBottom: 4 }}>✓ {s}</p>)}
          <h4 style={{ fontSize: '0.9rem', marginBottom: 8, marginTop: 14, color: 'var(--amber)' }}>Suggestions</h4>
          {result.speech.suggestions.map((s, i) => <p key={i} style={{ fontSize: '0.88rem', color: 'var(--text-dim)', marginBottom: 4 }}>→ {s}</p>)}
        </div>
      )}

      {!result.speech && tab === 'speech' && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p>Speech analysis was not available for this file.</p>
        </div>
      )}

      {/* Vision tab */}
      {tab === 'vision' && result.vision && (
        <div className="card">
          <h3 style={{ marginBottom: 6 }}>Non-verbal behaviour analysis</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-faint)', marginBottom: 20 }}>
            Method: {result.vision.analysis_method} · {result.vision.frames_analysed} frames analysed · {result.vision.video_duration_sec}s video
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 24 }}>
            {[
              { label: 'Eye Contact Est.', value: result.vision.eye_contact_score },
              { label: 'Face Visibility', value: result.vision.face_visibility_score },
              { label: 'Head Stability', value: result.vision.head_movement_score },
              { label: 'Posture Score', value: result.vision.posture_score },
              { label: 'Lighting Score', value: result.vision.lighting_score },
            ].map((m) => <MetricBar key={m.label} {...m} />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 18 }}>
            {[
              { label: 'Eye Contact', value: `${result.vision.eye_contact_pct.toFixed(0)}%` },
              { label: 'Face Visible', value: `${result.vision.face_visibility_pct.toFixed(0)}%` },
              { label: 'Head Movement', value: result.vision.head_movement_label.replace('_', ' ') },
              { label: 'Posture', value: result.vision.posture_label.replace('_', ' ') },
              { label: 'Lighting', value: result.vision.lighting_quality },
            ].map((m) => (
              <div key={m.label} style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{m.label}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: 4 }}>{m.value}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '12px 16px', background: 'rgba(139,92,246,0.07)', borderRadius: 10, fontSize: '0.8rem', color: 'var(--text-faint)', marginBottom: 18 }}>
            ⚠ Eye contact is estimated from face position geometry
            {result.vision.eye_contact_method === 'mediapipe_iris' ? ' and iris landmarks (MediaPipe)' : ' (OpenCV proxy)'},
            not true gaze tracking. Values are behavioural indicators, not definitive measurements.
          </div>
          <h4 style={{ fontSize: '0.9rem', marginBottom: 8, color: 'var(--green)' }}>Strengths</h4>
          {result.vision.strengths.map((s, i) => <p key={i} style={{ fontSize: '0.88rem', marginBottom: 4 }}>✓ {s}</p>)}
          <h4 style={{ fontSize: '0.9rem', marginBottom: 8, marginTop: 14, color: 'var(--amber)' }}>Suggestions</h4>
          {result.vision.suggestions.map((s, i) => <p key={i} style={{ fontSize: '0.88rem', color: 'var(--text-dim)', marginBottom: 4 }}>→ {s}</p>)}
        </div>
      )}

      {!result.vision && tab === 'vision' && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ marginBottom: 10 }}>Non-verbal analysis requires a video recording with OpenCV installed.</p>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Install OpenCV: <code>pip install opencv-python-headless</code></p>
        </div>
      )}

      {/* Transcript tab */}
      {tab === 'transcript' && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Audio transcript</h3>
          {result.transcript ? (
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.9, fontSize: '0.92rem', color: 'var(--text-dim)', background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '18px 20px' }}>
              {result.transcript}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <p style={{ color: 'var(--text-dim)' }}>Transcript not available for this recording.</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-faint)', marginTop: 8 }}>
                Install Whisper/faster-whisper for automatic transcription.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Upload Page ──────────────────────────────────────────────────────────

export default function Upload() {
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [result, setResult] = useState<UploadAnalysisResult | null>(null)
  const [error, setError] = useState('')
  const [question, setQuestion] = useState('')
  const [transcript, setTranscript] = useState('')
  const [showTranscriptInput, setShowTranscriptInput] = useState(false)
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null)

  const previewUrl = useMemo(() => {
    if (!file) return null
    return URL.createObjectURL(file)
  }, [file])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function handleFile(f: File) {
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`File is too large (${formatBytes(f.size)}). Maximum is ${MAX_FILE_MB} MB.`)
      return
    }
    setFile(f)
    setError('')
    setResult(null)
    setPhase('idle')
  }

  async function runAnalysis() {
    if (!file) return
    setError('')
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)
    if (transcript.trim()) {
      formData.append('transcript', transcript.trim())
    }
    if (question.trim()) {
      formData.append('question', question.trim())
    }

    try {
      setPhase('uploading')

      const resp = await fetch(`${API_BASE}/interview/upload-analyze`, {
        method: 'POST',
        body: formData,
      })

      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`Server error ${resp.status}: ${text}`)
      }

      // Simulate progress phases for UX while server processes
      setPhase('transcribing')
      await new Promise(r => setTimeout(r, 400))
      setPhase('analysing_speech')
      await new Promise(r => setTimeout(r, 400))
      setPhase('analysing_vision')
      await new Promise(r => setTimeout(r, 400))
      setPhase('scoring')

      const data: UploadAnalysisResult = await resp.json()
      setResult(data)
      setPhase('done')

      // ── Auto-save to localStorage ──────────────────────────────────────────
      try {
        const session = buildUploadSession(data as unknown as Record<string, unknown>)
        saveUploadSession(session)
        setSavedSessionId(session.id)
      } catch (saveErr) {
        console.warn('Could not save upload session:', saveErr)
      }
    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Analysis failed. Is the backend running on port 8000?')
      setPhase('error')
    }
  }

  const isProcessing = ['uploading', 'transcribing', 'analysing_speech', 'analysing_vision', 'scoring'].includes(phase)

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Full interview analysis</span>
          <h1>Upload recording</h1>
          <p>
            Upload your interview video or audio file. Our AI pipeline will analyse
            speech patterns, non-verbal behaviour, and communication quality.
          </p>
        </div>

        {/* Pipeline overview */}
        <div className="card" style={{ marginBottom: 28 }}>
          <h2 style={{ marginBottom: 18 }}>Analysis pipeline</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
            {[
              { icon: '📁', label: 'Media Processing', desc: 'Extract audio/video streams' },
              { icon: '🗣️', label: 'Speech Analysis', desc: 'WPM, fillers, vocabulary, pauses' },
              { icon: '👁️', label: 'Computer Vision', desc: 'Eye contact, posture, head movement' },
              { icon: '🧠', label: 'NLP Analysis', desc: 'Semantic relevance, concept coverage' },
              { icon: '📊', label: 'Scoring Engine', desc: 'Weighted composite score generation' },
            ].map((step) => (
              <div key={step.label} style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>{step.icon}</div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>{step.label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{step.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        {!result && (
          <div className="card" style={{ marginBottom: 20 }}>
            <DropZone onFile={handleFile} />

            {file && !isProcessing && (
              <div style={{ marginTop: 20 }}>
                {/* File info pill */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 18px', borderRadius: 12, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontSize: '1.8rem' }}>{file.type.startsWith('video') ? '📹' : '🎤'}</span>
                    <div>
                      <div style={{ fontWeight: 600 }}>{file.name}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>{formatBytes(file.size)} · {file.type || 'unknown type'}</div>
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: '0.82rem', padding: '6px 12px' }}
                    onClick={() => { setFile(null); setError(''); }}
                  >
                    Change file
                  </button>
                </div>

                {/* Media Preview Player */}
                {previewUrl && (
                  <div style={{ marginBottom: 18, borderRadius: 12, overflow: 'hidden', background: '#0a0a14', border: '1px solid var(--border)', textAlign: 'center', padding: file.type.startsWith('audio') ? '16px' : '0' }}>
                    {file.type.startsWith('video') || file.name.match(/\.(mp4|webm|mov|avi)$/i) ? (
                      <video
                        src={previewUrl}
                        controls
                        playsInline
                        style={{ width: '100%', maxHeight: 300, display: 'block', background: '#000' }}
                      />
                    ) : (
                      <audio src={previewUrl} controls style={{ width: '100%' }} />
                    )}
                  </div>
                )}

                {/* Analysis scope helper notice */}
                <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', marginBottom: 16, fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--violet-soft)', display: 'block', marginBottom: 3 }}>
                    💡 What will be analysed:
                  </strong>
                  • <strong>Visual Presence:</strong> Eye contact, head stability, posture, framing, and lighting are measured directly from your video frames.<br />
                  • <strong>Speech & Answer Quality:</strong> Optionally add your question and transcript below to evaluate relevance, pace, vocabulary, and filler words.
                </div>

                {/* Interview question prompt */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: 6 }}>
                    Interview question (optional)
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="e.g. Tell me about yourself, or a technical challenge you overcame"
                    style={{ width: '100%' }}
                  />
                </div>

                {/* Transcript or spoken notes */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: '0.84rem', fontWeight: 600 }}>
                      Spoken transcript / answer text (optional)
                    </label>
                    <button
                      type="button"
                      style={{
                        fontSize: '0.78rem', color: 'var(--violet-soft)', background: 'none', border: 'none',
                        cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit',
                      }}
                      onClick={() => setShowTranscriptInput((v) => !v)}
                    >
                      {showTranscriptInput ? 'Collapse' : transcript ? 'Edit' : '+ Add transcript'}
                    </button>
                  </div>
                  {showTranscriptInput && (
                    <textarea
                      className="input"
                      value={transcript}
                      onChange={(e) => setTranscript(e.target.value)}
                      placeholder="Paste what you said in the recording here to unlock filler word analysis, WPM pacing, and answer relevance scoring..."
                      rows={4}
                      style={{ width: '100%' }}
                    />
                  )}
                </div>

                <button className="btn btn-primary" onClick={runAnalysis} style={{ width: '100%', padding: '14px 20px', fontSize: '1rem' }}>
                  Analyse recording
                </button>
              </div>
            )}

            {isProcessing && (
              <div style={{ marginTop: 24, textAlign: 'center' }}>
                <p style={{ marginBottom: 12 }}>{phaseLabel(phase)}</p>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ width: `${phasePercent(phase)}%`, height: '100%', background: 'var(--grad)', transition: 'width 0.5s ease', borderRadius: 10 }} />
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 10 }}>
                  This may take 30–120 seconds depending on file size.
                </p>
              </div>
            )}

            {error && (
              <div role="alert" style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', fontSize: '0.88rem', color: '#f87171' }}>
                {error}
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* Saved banner */}
            {savedSessionId && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 12,
                padding: '14px 20px', borderRadius: 12, marginBottom: 16,
                background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.30)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.2rem' }}>💾</span>
                  <div>
                    <strong style={{ color: 'var(--green)', fontSize: '0.92rem' }}>Report saved automatically</strong>
                    <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: 2 }}>
                      Available in History · survives page refresh
                    </p>
                  </div>
                </div>
                <Link
                  className="btn btn-primary"
                  to={`/upload-report?id=${encodeURIComponent(savedSessionId)}`}
                  style={{ flexShrink: 0 }}
                >
                  View full report →
                </Link>
              </div>
            )}

            <ResultsPanel result={result} />
            <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => { setResult(null); setFile(null); setPhase('idle'); setSavedSessionId(null); setQuestion(''); setTranscript(''); }}>
                ← Analyse another recording
              </button>
              {savedSessionId && (
                <Link className="btn btn-ghost" to={`/upload-report?id=${encodeURIComponent(savedSessionId)}`}>
                  📄 View saved report
                </Link>
              )}
              <Link className="btn btn-ghost" to="/history">History</Link>
            </div>
          </>
        )}

        <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
          <Link className="btn btn-ghost" to="/practice">Practice interview instead</Link>
          <Link className="btn btn-ghost" to="/dashboard">Dashboard</Link>
        </div>
      </div>
    </section>
  )
}
