
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getSessions,
  getQuestionMeta,
  type StoredAnalysis,
} from '../utils/sessions'

// ── Data preparation ──────────────────────────────────────────────────────────

type SessionStat = {
  label: string          // short date label
  date: string
  score: number | null
  role: string
  difficulty: string
  answered: number
  total: number
}

type TopicStat = {
  topic: string
  attempts: number
  averageScore: number
  bestScore: number
  trend: 'up' | 'down' | 'stable'
}

type DimensionStat = {
  label: string
  average: number
}

function useAnalyticsData() {
  const sessions = useMemo(() => getSessions(), [])

  // Session timeline stats
  const sessionStats: SessionStat[] = useMemo(() =>
    [...sessions]
      .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime())
      .slice(-20)
      .map((s) => {
        const analyses = (s.analyses ?? []).filter((a): a is StoredAnalysis => a !== null)
        const avgScore = analyses.length > 0
          ? Math.round(analyses.reduce((sum, a) => sum + a.overall_score, 0) / analyses.length)
          : null
        const d = new Date(s.completedAt)
        return {
          label: `${d.getDate()}/${d.getMonth() + 1}`,
          date: s.completedAt,
          score: avgScore,
          role: s.role,
          difficulty: s.difficulty,
          answered: s.answers.filter((a) => a?.trim()).length,
          total: s.questions.length,
        }
      }), [sessions])

  // Topic performance
  const topicStats: TopicStat[] = useMemo(() => {
    const map: Record<string, number[]> = {}
    for (const session of sessions) {
      for (let i = 0; i < session.questions.length; i++) {
        const meta = getQuestionMeta(session, i)
        const analysis = session.analyses?.[i]
        if (!meta || !analysis) continue
        if (!map[meta.topic]) map[meta.topic] = []
        map[meta.topic].push(analysis.overall_score)
      }
    }
    return Object.entries(map).map(([topic, scores]) => {
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      const best = Math.max(...scores)
      const trend: 'up' | 'down' | 'stable' = scores.length < 2 ? 'stable'
        : scores[scores.length - 1] > scores[scores.length - 2] ? 'up'
        : scores[scores.length - 1] < scores[scores.length - 2] ? 'down' : 'stable'
      return { topic, attempts: scores.length, averageScore: avg, bestScore: best, trend }
    }).sort((a, b) => b.attempts - a.attempts)
  }, [sessions])

  // Rubric dimension averages
  const dimensionStats: DimensionStat[] = useMemo(() => {
    const map: Record<string, number[]> = {}
    for (const session of sessions) {
      for (const analysis of (session.analyses ?? [])) {
        if (!analysis) continue
        for (const dim of (analysis.dimensions ?? [])) {
          if (!map[dim.label]) map[dim.label] = []
          map[dim.label].push(dim.value)
        }
      }
    }
    return Object.entries(map).map(([label, vals]) => ({
      label,
      average: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    }))
  }, [sessions])

  const totalAnswered = sessions.reduce((sum, s) => sum + s.answers.filter((a) => a?.trim()).length, 0)
  const allScores = sessions.flatMap((s) =>
    (s.analyses ?? []).filter((a): a is StoredAnalysis => a !== null).map((a) => a.overall_score)
  )
  const avgScore = allScores.length > 0
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : null
  const bestScore = allScores.length > 0 ? Math.max(...allScores) : null
  const improvement = sessionStats.length >= 2
    ? (() => {
        const first = sessionStats[0].score ?? 0
        const last = sessionStats[sessionStats.length - 1].score ?? 0
        return last - first
      })()
    : null

  return { sessions, sessionStats, topicStats, dimensionStats, totalAnswered, avgScore, bestScore, improvement }
}

// ── SVG Bar Chart ─────────────────────────────────────────────────────────────

function BarChart({
  data,
  width = 600,
  height = 200,
}: {
  data: { label: string; value: number | null; color?: string }[]
  width?: number
  height?: number
}) {
  const padding = { top: 16, bottom: 36, left: 10, right: 10 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom
  const barW = Math.max(8, chartW / data.length - 6)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map((v) => {
        const y = padding.top + chartH - (v / 100) * chartH
        return (
          <g key={v}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y}
              stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={padding.left} y={y - 3} fill="rgba(255,255,255,0.25)" fontSize="9">{v}</text>
          </g>
        )
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const x = padding.left + (chartW / data.length) * i + (chartW / data.length - barW) / 2
        const val = d.value ?? 0
        const barH = (val / 100) * chartH
        const y = padding.top + chartH - barH
        const color = d.color ?? (val >= 70 ? '#34d399' : val >= 50 ? '#fbbf24' : d.value === null ? 'rgba(255,255,255,0.15)' : '#f87171')
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH}
              fill={color} rx="4" style={{ transition: 'height 0.6s ease' }} opacity={d.value === null ? 0.3 : 1} />
            {val > 0 && (
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fill={color} fontSize="9" fontWeight="600">
                {val}
              </text>
            )}
            <text x={x + barW / 2} y={padding.top + chartH + 16} textAnchor="middle"
              fill="rgba(255,255,255,0.4)" fontSize="9" transform={`rotate(-35, ${x + barW / 2}, ${padding.top + chartH + 16})`}>
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── SVG Radar Chart ───────────────────────────────────────────────────────────

function RadarChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length < 3) return null

  const cx = 150, cy = 150, r = 110
  const n = data.length
  const levels = [20, 40, 60, 80, 100]

  function polarToCart(angle: number, radius: number): [number, number] {
    const a = (angle - 90) * (Math.PI / 180)
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)]
  }

  const angleStep = 360 / n
  const points = data.map((d, i) => {
    const [x, y] = polarToCart(i * angleStep, (d.value / 100) * r)
    return `${x},${y}`
  }).join(' ')

  return (
    <svg viewBox="0 0 300 300" style={{ width: '100%', maxWidth: 300, height: 'auto' }}>
      {/* Grid levels */}
      {levels.map((lv) => {
        const pts = Array.from({ length: n }, (_, i) => {
          const [x, y] = polarToCart(i * angleStep, (lv / 100) * r)
          return `${x},${y}`
        }).join(' ')
        return (
          <polygon key={lv} points={pts}
            fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        )
      })}
      {/* Spokes */}
      {data.map((_, i) => {
        const [x, y] = polarToCart(i * angleStep, r)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      })}
      {/* Data polygon */}
      <polygon points={points}
        fill="rgba(139,92,246,0.20)" stroke="#8b5cf6" strokeWidth="2" strokeLinejoin="round" />
      {/* Data points */}
      {data.map((d, i) => {
        const [x, y] = polarToCart(i * angleStep, (d.value / 100) * r)
        return <circle key={i} cx={x} cy={y} r="4" fill="#8b5cf6" />
      })}
      {/* Labels */}
      {data.map((d, i) => {
        const [x, y] = polarToCart(i * angleStep, r + 22)
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fill="rgba(255,255,255,0.7)" fontSize="10" fontWeight="500">
            {d.label} ({d.value})
          </text>
        )
      })}
    </svg>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'var(--text)' }: {
  label: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 10 }}>{label}</p>
      <h2 style={{ fontSize: '2.2rem', color }}>{value}</h2>
      {sub && <p style={{ color: 'var(--text-faint)', fontSize: '0.8rem', marginTop: 6 }}>{sub}</p>}
    </div>
  )
}

// ── Main Analytics Page ───────────────────────────────────────────────────────

export default function Analytics() {
  const { sessions, sessionStats, topicStats, dimensionStats, totalAnswered, avgScore, bestScore, improvement } = useAnalyticsData()
  const [topicFilter, setTopicFilter] = useState<'all' | 'weak' | 'strong'>('all')

  const filteredTopics = topicStats.filter((t) => {
    if (topicFilter === 'weak') return t.averageScore < 55
    if (topicFilter === 'strong') return t.averageScore >= 70
    return true
  })

  if (sessions.length === 0) {
    return (
      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Performance tracking</span>
            <h1>Analytics</h1>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>📊</div>
            <h2 style={{ marginBottom: 12 }}>No data yet</h2>
            <p style={{ color: 'var(--text-dim)', marginBottom: 24 }}>
              Complete at least one practice interview with backend analysis to see performance charts.
            </p>
            <Link className="btn btn-primary" to="/practice">Start practising</Link>
          </div>
        </div>
      </section>
    )
  }

  const trendColor = improvement === null ? 'var(--text-dim)'
    : improvement > 0 ? 'var(--green)' : improvement < 0 ? '#f87171' : 'var(--amber)'
  const trendStr = improvement === null ? '—'
    : improvement > 0 ? `+${improvement}` : `${improvement}`

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Performance tracking</span>
          <h1>Analytics</h1>
          <p>
            Track your improvement across sessions, identify weak topics,
            and monitor rubric dimension growth over time.
          </p>
        </div>

        {/* Top stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
          <StatCard label="Total sessions" value={sessions.length} sub="Saved in this browser" />
          <StatCard label="Answers analysed" value={totalAnswered} sub="With backend ML scores" />
          <StatCard
            label="Average score"
            value={avgScore !== null ? `${avgScore}/100` : '—'}
            sub="Across all analysed answers"
            color={avgScore !== null ? (avgScore >= 70 ? 'var(--green)' : avgScore >= 50 ? 'var(--amber)' : '#f87171') : 'var(--text-dim)'}
          />
          <StatCard
            label="Best score"
            value={bestScore !== null ? `${bestScore}/100` : '—'}
            sub="Single answer high score"
            color="var(--cyan)"
          />
          <StatCard
            label="Score trend"
            value={trendStr}
            sub="First → latest session"
            color={trendColor}
          />
        </div>

        {/* Score timeline chart */}
        <div className="card" style={{ marginBottom: 28 }}>
          <h2 style={{ marginBottom: 6 }}>Score over time</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 20 }}>
            Average score per session (up to last 20 sessions). Grey bars = no analysis data.
          </p>
          {sessionStats.some((s) => s.score !== null) ? (
            <BarChart
              data={sessionStats.map((s) => ({ label: s.label, value: s.score }))}
              height={220}
            />
          ) : (
            <p style={{ color: 'var(--text-dim)', padding: '20px 0' }}>
              Complete sessions with backend analysis to see the score timeline.
            </p>
          )}
        </div>

        {/* Rubric radar chart */}
        {dimensionStats.length >= 3 && (
          <div className="card" style={{ marginBottom: 28 }}>
            <h2 style={{ marginBottom: 6 }}>Rubric dimension radar</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 20 }}>
              Average score per rubric dimension across all analysed answers.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'center' }}>
              <RadarChart data={dimensionStats.map((d) => ({ label: d.label, value: d.average }))} />
              <div>
                {dimensionStats.map((d) => (
                  <div key={d.label} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: '0.88rem' }}>{d.label}</span>
                      <span style={{
                        fontSize: '0.85rem', fontWeight: 600,
                        color: d.average >= 70 ? 'var(--green)' : d.average >= 50 ? 'var(--amber)' : '#f87171',
                      }}>{d.average}/100</span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{
                        width: `${d.average}%`, height: '100%', borderRadius: 10,
                        background: d.average >= 70 ? 'var(--green)' : d.average >= 50 ? 'var(--amber)' : '#f87171',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Topic performance */}
        {topicStats.length > 0 && (
          <div className="card" style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <div>
                <h2>Topic performance</h2>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: 4 }}>
                  Average score per topic. Sort by attempts.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['all', 'weak', 'strong'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setTopicFilter(f)}
                    style={{
                      padding: '6px 14px', borderRadius: 20, border: '1px solid',
                      borderColor: topicFilter === f ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.09)',
                      background: topicFilter === f ? 'rgba(139,92,246,0.15)' : 'transparent',
                      color: topicFilter === f ? 'var(--violet-soft)' : 'var(--text-dim)',
                      cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit',
                    }}
                  >
                    {f === 'all' ? 'All' : f === 'weak' ? '🔴 Needs work' : '🟢 Strong'}
                  </button>
                ))}
              </div>
            </div>

            {filteredTopics.length === 0 ? (
              <p style={{ color: 'var(--text-dim)' }}>No topics match this filter.</p>
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {filteredTopics.map((t) => {
                  const color = t.averageScore >= 70 ? 'var(--green)' : t.averageScore >= 50 ? 'var(--amber)' : '#f87171'
                  const trendIcon = t.trend === 'up' ? '↑' : t.trend === 'down' ? '↓' : '→'
                  return (
                    <div key={t.topic} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                      <div style={{ minWidth: 160 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{t.topic}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 3 }}>
                          {t.attempts} attempt{t.attempts !== 1 ? 's' : ''} · Best: {t.bestScore}
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
                          <div style={{ width: `${t.averageScore}%`, height: '100%', background: color, borderRadius: 10 }} />
                        </div>
                      </div>
                      <div style={{ minWidth: 70, textAlign: 'right' }}>
                        <span style={{ color, fontWeight: 700 }}>{t.averageScore}</span>
                        <span style={{ color: t.trend === 'up' ? 'var(--green)' : t.trend === 'down' ? '#f87171' : 'var(--text-dim)', marginLeft: 6 }}>{trendIcon}</span>
                      </div>
                      <Link
                        to={`/practice?role=${encodeURIComponent(t.topic)}`}
                        className="btn btn-ghost"
                        style={{ fontSize: '0.78rem', padding: '5px 12px', flexShrink: 0 }}
                      >
                        Practise
                      </Link>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Recent sessions table */}
        <div className="card">
          <h2 style={{ marginBottom: 16 }}>Session history</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Role', 'Difficulty', 'Answered', 'Avg Score', ''].map((h) => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...sessions].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()).slice(0, 15).map((s) => {
                  const analysed = (s.analyses ?? []).filter((a): a is StoredAnalysis => a !== null)
                  const avg = analysed.length > 0
                    ? Math.round(analysed.reduce((sum, a) => sum + a.overall_score, 0) / analysed.length)
                    : null
                  const answered = s.answers.filter((a) => a?.trim()).length
                  const color = avg !== null ? (avg >= 70 ? 'var(--green)' : avg >= 50 ? 'var(--amber)' : '#f87171') : 'var(--text-dim)'
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '10px 12px', color: 'var(--text-dim)' }}>{new Date(s.completedAt).toLocaleDateString()}</td>
                      <td style={{ padding: '10px 12px' }}>{s.role}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-dim)' }}>{s.difficulty}</td>
                      <td style={{ padding: '10px 12px' }}>{answered}/{s.questions.length}</td>
                      <td style={{ padding: '10px 12px', color, fontWeight: avg !== null ? 600 : 400 }}>
                        {avg !== null ? `${avg}/100` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Link to={`/report?id=${encodeURIComponent(s.id)}`} style={{ color: 'var(--violet-soft)', fontSize: '0.82rem' }}>
                          View report →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
