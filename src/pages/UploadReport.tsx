
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  deleteUploadSession,
  getUploadSessionById,
  updateUploadNote,
  type UploadCategoryResult,
  type UploadSession,
  type UploadSpeechResult,
  type UploadVisionResult,
} from '../utils/uploadSessions'

// ── Score utilities ───────────────────────────────────────────────────────────

function scoreColor(s: number) {
  return s >= 70 ? 'var(--green)' : s >= 50 ? 'var(--amber)' : '#f87171'
}

// ── Score Ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 130 }: { score: number; size?: number }) {
  const r = size / 2 - 11
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - score / 100)
  const color = scoreColor(score)
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="rgba(255,255,255,0.07)" strokeWidth="10" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 1.2s ease' }} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <strong style={{ fontSize: size > 110 ? '2.1rem' : '1.4rem', color, lineHeight: 1 }}>{score}</strong>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: 2 }}>/ 100</span>
      </div>
    </div>
  )
}

// ── Score Bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ label, value, max = 100, unit = '' }: {
  label: string; value: number; max?: number; unit?: string
}) {
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

// ── Category Card ─────────────────────────────────────────────────────────────

function CategoryCard({ cat }: { cat: UploadCategoryResult }) {
  const [open, setOpen] = useState(false)
  const color = scoreColor(cat.score)
  return (
    <div style={{
      padding: '16px 20px', borderRadius: 14,
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${open ? 'rgba(139,92,246,0.3)' : 'var(--border)'}`,
      transition: 'border-color 0.2s',
    }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 14,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)' }}>{cat.label}</span>
            <span style={{ color, fontWeight: 700, fontSize: '1.3rem' }}>{cat.score}</span>
          </div>
          <div style={{ marginTop: 8, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ width: `${cat.score}%`, height: '100%', background: color, borderRadius: 10 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>weight {cat.weight}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>{open ? '▲ hide detail' : '▼ show detail'}</span>
          </div>
        </div>
      </button>

      {open && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          {cat.strengths.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {cat.strengths.map((s, i) => (
                <p key={i} style={{ color: 'var(--green)', fontSize: '0.85rem', marginBottom: 4 }}>✓ {s}</p>
              ))}
            </div>
          )}
          {cat.suggestions.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {cat.suggestions.map((s, i) => (
                <p key={i} style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 4 }}>→ {s}</p>
              ))}
            </div>
          )}
          {Object.keys(cat.sub_scores).length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-faint)' }}>Sub-scores</summary>
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                {Object.entries(cat.sub_scores).map(([k, v]) => (
                  <div key={k} style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-dim)' }}>{k}: </span>
                    <strong>{typeof v === 'number' ? Math.round(v as number) : String(v)}</strong>
                  </div>
                ))}
              </div>
            </details>
          )}
          <p style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: 10 }}>
            Source: {cat.data_source}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Speech Panel ──────────────────────────────────────────────────────────────

function SpeechPanel({ speech }: { speech: UploadSpeechResult }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 18, marginBottom: 24 }}>
        <ScoreBar label="Speech Score" value={speech.speech_score} />
        <ScoreBar label="WPM Score" value={speech.wpm_score} />
        <ScoreBar label="Filler Score (less=worse)" value={speech.filler_score} />
        <ScoreBar label="Vocabulary Richness" value={Math.round(speech.type_token_ratio * 100)} unit="%" />
        <ScoreBar label="Repetition Score" value={speech.repetition_score} />
        <ScoreBar label="Consistency Score" value={speech.consistency_score} />
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Words Per Minute', value: `${speech.wpm.toFixed(0)} WPM` },
          { label: 'Word Count', value: `${speech.word_count} words` },
          { label: 'Unique Words', value: `${speech.unique_word_count}` },
          { label: 'Sentences', value: `${speech.sentence_count}` },
          { label: 'Filler Words', value: `${speech.total_filler_count} found` },
          { label: 'Est. Duration', value: `${speech.estimated_duration_sec.toFixed(0)}s` },
          { label: 'Est. Pauses', value: `${speech.pause_analysis.estimated_count}` },
          { label: 'Answer Length', value: speech.answer_length_label.replace(/_/g, ' ') },
        ].map((m) => (
          <div key={m.label} style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{m.label}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 600, marginTop: 4 }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Filler words */}
      {speech.filler_details.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <h4 style={{ fontSize: '0.9rem', marginBottom: 10 }}>Filler words detected</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {speech.filler_details.map((f) => (
              <span key={f.word} style={{
                padding: '3px 12px', borderRadius: 20,
                background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)',
                fontSize: '0.8rem', color: 'var(--amber)',
              }}>
                "{f.word}" ×{f.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Repeated phrases */}
      {speech.repeated_phrases.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <h4 style={{ fontSize: '0.9rem', marginBottom: 10 }}>Repeated phrases</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {speech.repeated_phrases.map((r, i) => (
              <span key={i} style={{
                padding: '3px 12px', borderRadius: 20,
                background: 'rgba(139,92,246,0.10)', border: '1px solid rgba(139,92,246,0.25)',
                fontSize: '0.8rem', color: 'var(--violet-soft)',
              }}>
                "{r.phrase}" ×{r.count} ({r.type})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Feedback */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.2)' }}>
          <h4 style={{ fontSize: '0.85rem', color: 'var(--green)', marginBottom: 8 }}>Strengths</h4>
          {speech.strengths.map((s, i) => <p key={i} style={{ fontSize: '0.83rem', marginBottom: 4 }}>✓ {s}</p>)}
        </div>
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <h4 style={{ fontSize: '0.85rem', color: 'var(--amber)', marginBottom: 8 }}>Suggestions</h4>
          {speech.suggestions.map((s, i) => <p key={i} style={{ fontSize: '0.83rem', color: 'var(--text-dim)', marginBottom: 4 }}>→ {s}</p>)}
        </div>
      </div>

      <p style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: 12 }}>
        Formula: {speech.speech_score_formula}
      </p>
    </div>
  )
}

// ── Vision Panel ──────────────────────────────────────────────────────────────

function VisionPanel({ vision }: { vision: UploadVisionResult }) {
  return (
    <div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-faint)', marginBottom: 18 }}>
        Method: {vision.analysis_method} · {vision.frames_analysed} frames · {vision.video_duration_sec.toFixed(1)}s duration
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 18, marginBottom: 20 }}>
        <ScoreBar label="Eye Contact" value={vision.eye_contact_score} />
        <ScoreBar label="Face Visibility" value={vision.face_visibility_score} />
        <ScoreBar label="Head Stability" value={vision.head_movement_score} />
        <ScoreBar label="Posture" value={vision.posture_score} />
        <ScoreBar label="Lighting" value={vision.lighting_score} />
        <ScoreBar label="Non-Verbal Overall" value={vision.non_verbal_score} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Eye Contact Est.', value: `${vision.eye_contact_pct.toFixed(0)}%` },
          { label: 'Face Visible', value: `${vision.face_visibility_pct.toFixed(0)}%` },
          { label: 'Head Movement', value: vision.head_movement_label.replace(/_/g, ' ') },
          { label: 'Posture', value: vision.posture_label.replace(/_/g, ' ') },
          { label: 'Lighting', value: vision.lighting_quality },
          { label: 'Avg Brightness', value: vision.avg_brightness.toFixed(0) },
        ].map((m) => (
          <div key={m.label} style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{m.label}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 600, marginTop: 4 }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '12px 16px', background: 'rgba(139,92,246,0.07)', borderRadius: 10, fontSize: '0.8rem', color: 'var(--text-faint)', marginBottom: 18 }}>
        ⚠ Eye contact estimated via {vision.eye_contact_method === 'mediapipe_iris' ? 'MediaPipe iris landmarks' : 'face-centre geometric proxy'}.
        Values are behavioural indicators, not definitive psychological measurements.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.2)' }}>
          <h4 style={{ fontSize: '0.85rem', color: 'var(--green)', marginBottom: 8 }}>Strengths</h4>
          {vision.strengths.map((s, i) => <p key={i} style={{ fontSize: '0.83rem', marginBottom: 4 }}>✓ {s}</p>)}
        </div>
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <h4 style={{ fontSize: '0.85rem', color: 'var(--amber)', marginBottom: 8 }}>Suggestions</h4>
          {vision.suggestions.map((s, i) => <p key={i} style={{ fontSize: '0.83rem', color: 'var(--text-dim)', marginBottom: 4 }}>→ {s}</p>)}
        </div>
      </div>

      <p style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: 12 }}>
        Formula: {vision.non_verbal_score_formula}
      </p>
    </div>
  )
}

// ── Main UploadReport Page ────────────────────────────────────────────────────

type Tab = 'overview' | 'speech' | 'vision' | 'transcript'

export default function UploadReport() {
  const [params] = useSearchParams()
  const id = params.get('id')

  const [session, setSession] = useState<UploadSession | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [note, setNote] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!id) { setNotFound(true); return }
    const found = getUploadSessionById(id)
    if (!found) { setNotFound(true); return }
    setSession(found)
    setNote(found.userNote ?? '')
  }, [id])

  function handleSaveNote() {
    if (!session) return
    updateUploadNote(session.id, note)
    setSession({ ...session, userNote: note })
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 2000)
  }

  function handleDelete() {
    if (!session) return
    deleteUploadSession(session.id)
    window.location.href = '/history'
  }

  if (notFound) {
    return (
      <section className="section">
        <div className="container">
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <h2 style={{ marginBottom: 12 }}>Report not found</h2>
            <p style={{ color: 'var(--text-dim)', marginBottom: 24 }}>
              This upload report no longer exists or the ID is invalid.
            </p>
            <Link className="btn btn-primary" to="/history">Back to history</Link>
          </div>
        </div>
      </section>
    )
  }

  if (!session) {
    return (
      <section className="section">
        <div className="container">
          <p style={{ color: 'var(--text-dim)' }}>Loading…</p>
        </div>
      </section>
    )
  }

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

  const gradeColor = scoreColor(session.overallScore)

  return (
    <section className="section">
      <div className="container">

        {/* Breadcrumb */}
        <div style={{ marginBottom: 24, display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-dim)' }}>
          <Link to="/history" style={{ color: 'var(--violet-soft)' }}>History</Link>
          <span>›</span>
          <span>Upload report</span>
        </div>

        {/* Hero header */}
        <div className="card" style={{ marginBottom: 20, background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(34,211,238,0.05) 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
            <div style={{ flex: 1 }}>
              <span className="eyebrow">Upload analysis report</span>
              <h1 style={{ margin: '10px 0 6px', fontSize: '1.8rem' }}>
                {session.hasVideo ? '📹' : '🎤'} {session.fileName}
              </h1>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>
                Saved {new Date(session.savedAt).toLocaleString()}
                {' '}· {session.fileType.startsWith('video') ? 'Video recording' : 'Audio recording'}
                {' '}· {session.dataCompleteness === 'full' ? 'Full analysis' : session.dataCompleteness === 'partial' ? 'Partial analysis' : 'Text analysis'}
              </p>
            </div>

            {/* Score ring + grade */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <ScoreRing score={session.overallScore} size={120} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2.8rem', fontWeight: 800, color: gradeColor, lineHeight: 1 }}>
                  {session.overallGrade}
                </div>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: 4 }}>
                  {session.overallLabel}
                </div>
              </div>
            </div>
          </div>

          {/* Category mini-scores */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 22 }}>
            {session.categories.map((cat) => (
              <div key={cat.label} style={{
                padding: '12px 16px', borderRadius: 12,
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 5 }}>{cat.label}</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: scoreColor(cat.score) }}>{cat.score}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>weight {cat.weight}</div>
              </div>
            ))}
          </div>

          {/* Top insight banner */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 16 }}>
            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' }}>
              <strong style={{ color: 'var(--green)', fontSize: '0.85rem' }}>✓ Top strength</strong>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.83rem', marginTop: 5 }}>{session.topStrength || 'No data'}</p>
            </div>
            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <strong style={{ color: 'var(--amber)', fontSize: '0.85rem' }}>⚠ Priority improvement</strong>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.83rem', marginTop: 5 }}>{session.topSuggestion || 'No data'}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {(['overview', 'speech', 'vision', 'transcript'] as Tab[]).map((t) => (
            <button
              key={t}
              style={tabStyle(tab === t)}
              onClick={() => setTab(t)}
            >
              {t === 'overview' ? '📊 Overview' : t === 'speech' ? '🎙️ Speech' : t === 'vision' ? '👁️ Non-Verbal' : '📝 Transcript'}
            </button>
          ))}
        </div>

        {/* ── Overview tab ── */}
        {tab === 'overview' && (
          <div className="card">
            <h2 style={{ marginBottom: 20 }}>Category breakdown</h2>
            <div style={{ display: 'grid', gap: 14 }}>
              {session.categories.map((cat) => (
                <CategoryCard key={cat.label} cat={cat} />
              ))}
            </div>
            <details style={{ marginTop: 20 }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-dim)' }}>View scoring formula</summary>
              <code style={{
                display: 'block', marginTop: 10, fontSize: '0.75rem',
                color: 'var(--text-faint)', wordBreak: 'break-all',
                background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 8,
              }}>
                {session.formula}
              </code>
            </details>
          </div>
        )}

        {/* ── Speech tab ── */}
        {tab === 'speech' && (
          <div className="card">
            <h2 style={{ marginBottom: 4 }}>Speech & delivery analysis</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 20 }}>
              Source: {session.speech?.source ?? 'unavailable'}
            </p>
            {session.speech
              ? <SpeechPanel speech={session.speech} />
              : (
                <div style={{ textAlign: 'center', padding: 32 }}>
                  <p style={{ color: 'var(--text-dim)' }}>Speech analysis not available for this session.</p>
                </div>
              )
            }
          </div>
        )}

        {/* ── Vision tab ── */}
        {tab === 'vision' && (
          <div className="card">
            <h2 style={{ marginBottom: 4 }}>Non-verbal behaviour analysis</h2>
            {session.vision
              ? <VisionPanel vision={session.vision} />
              : (
                <div style={{ textAlign: 'center', padding: 32 }}>
                  <p style={{ color: 'var(--text-dim)', marginBottom: 10 }}>
                    Video analysis requires a video file and OpenCV installed in the backend.
                  </p>
                  <code style={{ fontSize: '0.82rem', color: 'var(--text-faint)' }}>
                    pip install opencv-python-headless
                  </code>
                </div>
              )
            }
          </div>
        )}

        {/* ── Transcript tab ── */}
        {tab === 'transcript' && (
          <div className="card">
            <h2 style={{ marginBottom: 16 }}>Transcript</h2>
            {session.transcript
              ? (
                <div style={{
                  whiteSpace: 'pre-wrap', lineHeight: 1.9, fontSize: '0.92rem',
                  color: 'var(--text-dim)', background: 'rgba(255,255,255,0.03)',
                  borderRadius: 12, padding: '18px 20px',
                }}>
                  {session.transcript}
                </div>
              )
              : (
                <p style={{ color: 'var(--text-dim)', padding: '20px 0' }}>
                  No transcript available. Install <code>faster-whisper</code> for auto-transcription,
                  or paste a transcript when uploading.
                </p>
              )
            }
          </div>
        )}

        {/* ── Notes ── */}
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ marginBottom: 12, fontSize: '1.1rem' }}>Your notes</h2>
          <textarea
            ref={noteRef}
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add personal notes, reflections, or follow-up action items for this interview recording…"
            rows={4}
            style={{ width: '100%', marginBottom: 12 }}
          />
          <button className="btn btn-primary" onClick={handleSaveNote} style={{ marginRight: 10 }}>
            {noteSaved ? '✓ Saved' : 'Save note'}
          </button>
        </div>

        {/* ── Actions footer ── */}
        <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link className="btn btn-ghost" to="/history">← Back to history</Link>
            <Link className="btn btn-ghost" to="/upload">Upload another</Link>
            <Link className="btn btn-ghost" to="/analytics">View analytics</Link>
          </div>

          {!confirmDelete ? (
            <button className="btn btn-ghost" style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}
              onClick={() => setConfirmDelete(true)}>
              Delete report
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Permanently delete?</span>
              <button className="btn btn-primary" style={{ background: '#ef4444', border: 'none' }} onClick={handleDelete}>
                Yes, delete
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          )}
        </div>

      </div>
    </section>
  )
}
