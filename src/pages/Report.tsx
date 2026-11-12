
import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getSessionById, updateSessionAnalysis, toStoredAnalysis, getQuestionMeta, getQuestionTexts, type StoredAnalysis, type InterviewSession } from '../utils/sessions'
import { analyzeAnswerV2, checkBackendHealth, type AnswerAnalysisV2, type BackendHealth } from '../utils/analysis'

// ── Sub-components ──────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 42
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - score / 100)
  const color = score >= 70 ? '#34d399' : score >= 50 ? '#fbbf24' : '#f87171'

  return (
    <div style={{ position: 'relative', width: 100, height: 100 }}>
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <strong style={{ fontSize: '1.4rem', lineHeight: 1, color }}>{score}</strong>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>/ 100</span>
      </div>
    </div>
  )
}

function DimensionBar({ label, value, method }: { label: string; value: number; method: string }) {
  const color = value >= 70 ? 'var(--green)' : value >= 50 ? 'var(--amber)' : '#f87171'
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: '0.9rem' }}>{label}</span>
        <span style={{ fontSize: '0.85rem', color, fontWeight: 600 }}>{value}</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
        <div
          style={{
            width: `${value}%`, height: '100%',
            background: color,
            borderRadius: 10,
            transition: 'width 0.6s ease',
          }}
        />
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: 3 }}>
        Scored by: {method.replace(/_/g, ' ')}
      </div>
    </div>
  )
}

function ConceptPill({ concept, covered }: { concept: string; covered: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', borderRadius: 20, fontSize: '0.8rem',
        background: covered ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
        border: `1px solid ${covered ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
        color: covered ? 'var(--green)' : '#f87171',
      }}
    >
      {covered ? '✓' : '○'} {concept}
    </span>
  )
}

function AnswerAnalysisCard({
  index,
  questionText,
  answer,
  analysis,
  adaptiveReason,
}: {
  index: number
  questionText: string
  answer: string
  analysis: StoredAnalysis | null
  adaptiveReason?: string
}) {
  const isAnswered = answer?.trim()

  return (
    <article
      style={{
        padding: '24px 0',
        borderTop: '1px solid var(--border)',
      }}
    >
      <p className="eyebrow" style={{ marginBottom: 8 }}>Question {index + 1}</p>

      {adaptiveReason && (
        <div style={{
          fontSize: '0.78rem', color: 'var(--text-dim)',
          padding: '5px 12px', borderRadius: 8,
          background: 'rgba(139,92,246,0.08)',
          border: '1px solid rgba(139,92,246,0.15)',
          marginBottom: 10,
          display: 'inline-block',
        }}>
          <strong style={{ color: 'var(--violet-soft)' }}>Selected because: </strong>{adaptiveReason}
        </div>
      )}

      <h3 style={{ fontSize: '1.1rem', margin: '0 0 14px' }}>{questionText}</h3>

      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 16,
          whiteSpace: 'pre-wrap',
          lineHeight: 1.8,
          color: isAnswered ? 'var(--text)' : 'var(--text-dim)',
          fontStyle: isAnswered ? 'normal' : 'italic',
        }}
      >
        {isAnswered || 'No answer was submitted for this question.'}
      </div>

      {!analysis && isAnswered && (
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
          Analysis pending — the backend may not have been running when this session was saved.
        </p>
      )}

      {analysis && (
        <div>
          {/* Score + model badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
            <ScoreRing score={analysis.overall_score} />
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                {analysis.model_available ? '🤖 Semantic NLP scoring' : '📏 Rule-based scoring'}
                <span style={{ marginLeft: 8, opacity: 0.6 }}>({analysis.analysis_type})</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 4 }}>
                {analysis.word_count} words submitted
              </div>
            </div>
          </div>

          {/* Rubric dimensions */}
          {analysis.dimensions && analysis.dimensions.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ fontSize: '1rem', marginBottom: 14 }}>Rubric breakdown</h4>
              {analysis.dimensions.map((d) => (
                <DimensionBar key={d.label} label={d.label} value={d.value} method={d.method} />
              ))}
            </div>
          )}

          {/* Semantic similarity */}
          {analysis.semantic_similarity !== null && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 10,
                background: 'rgba(34,211,238,0.06)',
                border: '1px solid rgba(34,211,238,0.18)',
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--cyan)' }}>
                  Semantic similarity to reference
                </span>
                <strong style={{ color: 'var(--cyan)' }}>
                  {Math.round((analysis.semantic_similarity ?? 0) * 100)}%
                </strong>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', margin: 0 }}>
                {analysis.semantic_interpretation}
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)', margin: '6px 0 0', fontStyle: 'italic' }}>
                Note: similarity to one reference answer is not a definitive correctness measure.
              </p>
            </div>
          )}

          {/* Concept coverage */}
          {(analysis.concepts_covered.length > 0 || analysis.concepts_to_revisit.length > 0) && (
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: '0.95rem', marginBottom: 10 }}>Concept coverage</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {analysis.concepts_covered.map((c) => (
                  <ConceptPill key={c} concept={c} covered={true} />
                ))}
                {analysis.concepts_to_revisit.map((c) => (
                  <ConceptPill key={c} concept={c} covered={false} />
                ))}
              </div>
            </div>
          )}

          {/* Strengths */}
          {analysis.strengths.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <h4 style={{ fontSize: '0.9rem', color: 'var(--green)', marginBottom: 8 }}>Strengths</h4>
              <ul style={{ paddingLeft: 20, lineHeight: 2, margin: 0 }}>
                {analysis.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          {/* Suggestions */}
          {analysis.improvement_suggestions.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <h4 style={{ fontSize: '0.9rem', color: 'var(--amber)', marginBottom: 8 }}>
                Suggestions for improvement
              </h4>
              <ul style={{ paddingLeft: 20, lineHeight: 2, margin: 0 }}>
                {analysis.improvement_suggestions.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          {/* Reference outline */}
          {analysis.reference_outline && (
            <details style={{ marginTop: 12 }}>
              <summary
                style={{
                  cursor: 'pointer', fontSize: '0.85rem',
                  color: 'var(--text-dim)', userSelect: 'none',
                }}
              >
                View reference answer outline
              </summary>
              <div
                style={{
                  marginTop: 10, padding: '12px 16px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 10, lineHeight: 1.8,
                  fontSize: '0.88rem', color: 'var(--text-dim)',
                }}
              >
                {analysis.reference_outline}
              </div>
            </details>
          )}
        </div>
      )}
    </article>
  )
}

// ── Main Report Component ─────────────────────────────────────────────────────

export default function Report() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('id')
  const [session, setSession] = useState<InterviewSession | undefined>(
    sessionId ? getSessionById(sessionId) : undefined,
  )
  const [analysing, setAnalysing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [backendHealth, setBackendHealth] = useState<BackendHealth | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  const questionTexts = session ? getQuestionTexts(session) : []
  const analyses = session?.analyses ?? []

  const hasAnyAnalysis = analyses.some((a) => a !== null)
  const needsAnalysis = session !== undefined
    && session.answers.some((a) => a?.trim())
    && !hasAnyAnalysis

  // Health check
  useEffect(() => {
    checkBackendHealth()
      .then(setBackendHealth)
      .catch(() => setBackendHealth(null))
  }, [])

  // Auto-run analysis if not yet done
  useEffect(() => {
    if (!needsAnalysis || analysing || !sessionId) return
    runAnalysis()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsAnalysis, sessionId])

  async function runAnalysis() {
    if (!session || !sessionId) return
    setAnalysing(true)
    setAnalysisError(null)
    setAnalysisProgress(0)

    const answeredIndices = session.answers
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a?.trim())
      .map(({ i }) => i)

    for (let idx = 0; idx < answeredIndices.length; idx++) {
      const i = answeredIndices[idx]
      const answer = session.answers[i]
      const questionText = questionTexts[i] ?? ''
      const meta = getQuestionMeta(session, i)

      try {
        const result: AnswerAnalysisV2 = await analyzeAnswerV2(
          questionText,
          answer ?? '',
          {
            questionId: meta?.id ?? undefined,
            expectedConcepts: meta?.expected_concepts,
          },
        )

        const stored = toStoredAnalysis(result)
        updateSessionAnalysis(sessionId, i, stored)

        // Refresh local state
        setSession((prev) => {
          if (!prev) return prev
          const newAnalyses = [...(prev.analyses ?? [])]
          newAnalyses[i] = stored
          return { ...prev, analyses: newAnalyses }
        })
      } catch (err) {
        console.error(`Analysis failed for question ${i}:`, err)
      }

      setAnalysisProgress(Math.round(((idx + 1) / answeredIndices.length) * 100))
    }

    if (backendHealth === null) {
      setAnalysisError(
        'The analysis server is not reachable. Make sure the backend is running on port 8000, then reload this page.'
      )
    }

    setAnalysing(false)
  }

  // ── Empty states ──────────────────────────────────────────────────────────

  if (sessionId && !session) {
    return (
      <section className="section">
        <div className="container">
          <div className="card">
            <h1>Session not found</h1>
            <p style={{ margin: '16px 0', color: 'var(--text-dim)' }}>
              This session may have been deleted or its browser data may have been cleared.
            </p>
            <Link className="btn btn-primary" to="/practice">Start a new interview</Link>
            {' '}
            <Link className="btn btn-ghost" to="/history">View history</Link>
          </div>
        </div>
      </section>
    )
  }

  if (!session) {
    return (
      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Report preview</span>
            <h1>Interview report</h1>
            <p>Complete a practice interview to see your personalised analysis here.</p>
          </div>
          <div className="card">
            <p style={{ color: 'var(--text-dim)', marginBottom: 20 }}>
              Reports include per-answer AI scoring (semantic NLP when the backend is running),
              rubric breakdowns, concept coverage, and personalised improvement suggestions.
            </p>
            <Link className="btn btn-primary" to="/practice">Start an interview</Link>
            {' '}
            <Link className="btn btn-ghost" to="/history">View history</Link>
          </div>
        </div>
      </section>
    )
  }

  // ── Computed summary stats ────────────────────────────────────────────────

  const answeredCount = session.answers.filter((a) => a?.trim()).length
  const completion = Math.round((answeredCount / session.questions.length) * 100)
  const completedDate = new Date(session.completedAt)
  const formattedDate = Number.isNaN(completedDate.getTime())
    ? 'Date unavailable'
    : completedDate.toLocaleString()

  const scoredAnalyses = analyses.filter((a): a is StoredAnalysis => a !== null)
  const averageScore = scoredAnalyses.length > 0
    ? Math.round(scoredAnalyses.reduce((sum, a) => sum + a.overall_score, 0) / scoredAnalyses.length)
    : null

  const allConceptsToRevisit = [
    ...new Set(scoredAnalyses.flatMap((a) => a.concepts_to_revisit)),
  ]

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Your interview results</span>
          <h1>Interview report</h1>
          <p>
            Review your AI-analysed answers, concept coverage, and personalised improvement plan.
          </p>
        </div>

        {/* Analysis progress banner */}
        {analysing && (
          <div
            style={{
              padding: '14px 20px',
              borderRadius: 12,
              background: 'rgba(139,92,246,0.12)',
              border: '1px solid rgba(139,92,246,0.3)',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 6, fontSize: '0.9rem' }}>
                Analysing your answers… ({analysisProgress}%)
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${analysisProgress}%`,
                    height: '100%',
                    background: 'var(--grad)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {analysisError && (
          <div
            role="alert"
            style={{
              padding: '12px 18px',
              borderRadius: 10,
              background: 'rgba(239,68,68,0.10)',
              border: '1px solid rgba(239,68,68,0.25)',
              marginBottom: 20,
              fontSize: '0.88rem',
            }}
          >
            {analysisError}
            <button
              className="btn btn-ghost"
              style={{ marginLeft: 16, fontSize: '0.82rem', padding: '4px 12px' }}
              onClick={runAnalysis}
            >
              Retry analysis
            </button>
          </div>
        )}

        {/* Session summary card */}
        <div className="card" style={{ marginBottom: 24 }}>
          <span className="eyebrow">Completed session</span>
          <h2 style={{ fontSize: '1.5rem', margin: '12px 0' }}>{session.role}</h2>
          <p style={{ color: 'var(--text-dim)', marginBottom: 20 }}>
            {session.difficulty} difficulty · {session.interviewType || 'Mixed'} ·{' '}
            {session.questionMode === 'voice' ? 'Voice' : 'Written'} · {formattedDate}
          </p>

          <div className="features">
            <div>
              <p style={{ color: 'var(--text-dim)' }}>Questions answered</p>
              <h2 style={{ marginTop: 8, fontSize: '1.8rem' }}>
                {answeredCount}/{session.questions.length}
              </h2>
            </div>
            <div>
              <p style={{ color: 'var(--text-dim)' }}>Completion</p>
              <h2 style={{ marginTop: 8, fontSize: '1.8rem' }}>{completion}%</h2>
            </div>
            {averageScore !== null && (
              <div>
                <p style={{ color: 'var(--text-dim)' }}>Average score</p>
                <h2
                  style={{
                    marginTop: 8, fontSize: '1.8rem',
                    color: averageScore >= 70 ? 'var(--green)' : averageScore >= 50 ? 'var(--amber)' : '#f87171',
                  }}
                >
                  {averageScore}/100
                </h2>
              </div>
            )}
          </div>

          {averageScore !== null && (
            <p style={{ color: 'var(--text-faint)', marginTop: 16, fontSize: '0.82rem' }}>
              Score derived from {scoredAnalyses.length} analysed answer(s) using{' '}
              {scoredAnalyses[0]?.model_available ? 'semantic NLP' : 'rule-based heuristics'}.
            </p>
          )}
        </div>

        {/* Concepts to revisit summary */}
        {allConceptsToRevisit.length > 0 && !analysing && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h2 style={{ marginBottom: 12 }}>Concepts to revisit</h2>
            <p style={{ color: 'var(--text-dim)', marginBottom: 16, fontSize: '0.9rem' }}>
              These concepts were not clearly addressed across your answers. Consider reviewing them before your next interview.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {allConceptsToRevisit.map((c) => (
                <ConceptPill key={c} concept={c} covered={false} />
              ))}
            </div>
          </div>
        )}

        {/* Per-question analysis */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 8 }}>Answer-by-answer analysis</h2>
          <p style={{ color: 'var(--text-dim)', marginBottom: 4, fontSize: '0.9rem' }}>
            Each answer is evaluated on relevance, coverage, explanation quality, structure, and confidence.
          </p>
          {backendHealth && !backendHealth.model_available && (
            <p style={{ color: 'var(--amber)', fontSize: '0.82rem', marginBottom: 4 }}>
              Semantic AI model not loaded — scores use rule-based heuristics.
              Run the backend with sentence-transformers installed to enable semantic scoring.
            </p>
          )}

          {questionTexts.map((questionText, i) => (
            <AnswerAnalysisCard
              key={`${session.id}-${i}`}
              index={i}
              questionText={questionText}
              answer={session.answers[i] ?? ''}
              analysis={analyses[i] ?? null}
              adaptiveReason={session.adaptiveReasons?.[i]}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="card">
          <h2 style={{ marginBottom: 16 }}>What to do next</h2>
          <ul style={{ paddingLeft: 22, lineHeight: 2, marginBottom: 20 }}>
            {allConceptsToRevisit.length > 0 && (
              <li>Review the {allConceptsToRevisit.length} concept(s) marked for revision above.</li>
            )}
            <li>Re-read any answer below 50/100 and rewrite it with the suggestions in mind.</li>
            <li>Start a new session to practice the same topic with harder questions.</li>
            <li>Check your history to track improvement across sessions.</li>
          </ul>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Link className="btn btn-primary" to="/practice">Practice again</Link>
            <Link className="btn btn-ghost" to="/history">View history</Link>
            <Link className="btn btn-ghost" to="/dashboard">Dashboard</Link>
          </div>
        </div>
      </div>
    </section>
  )
}
