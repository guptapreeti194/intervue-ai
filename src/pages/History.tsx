
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  deleteSession as removeSavedSession,
  getSessions,
  type InterviewSession,
} from '../utils/sessions'
import {
  deleteUploadSession,
  getUploadSessions,
  type UploadSession,
} from '../utils/uploadSessions'

type ActiveTab = 'practice' | 'uploads'

export default function History() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('practice')

  // ── Practice sessions state ────────────────────────────────────────────────
  const [sessions, setSessions] = useState<InterviewSession[]>(getSessions)
  const [search, setSearch] = useState('')
  const [difficulty, setDifficulty] = useState('All')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  // ── Upload sessions state ──────────────────────────────────────────────────
  const [uploads, setUploads] = useState<UploadSession[]>(getUploadSessions)
  const [uploadSearch, setUploadSearch] = useState('')
  const [confirmDeleteUploadId, setConfirmDeleteUploadId] = useState<string | null>(null)

  const filteredSessions = useMemo(() => {
    const term = search.trim().toLowerCase()
    return sessions.filter((session) => {
      const matchesRole = session.role.toLowerCase().includes(term)
      const matchesDifficulty = difficulty === 'All' || session.difficulty === difficulty
      return matchesRole && matchesDifficulty
    })
  }, [sessions, search, difficulty])

  const filteredUploads = useMemo(() => {
    const term = uploadSearch.trim().toLowerCase()
    return uploads.filter((u) => u.fileName.toLowerCase().includes(term))
  }, [uploads, uploadSearch])

  function handleDelete(id: string) {
    try {
      removeSavedSession(id)
      setSessions(getSessions())
      setConfirmDeleteId(null)
      setMessage('Session deleted.')
    } catch {
      setMessage('Could not delete the session. Please try again.')
    }
  }

  function handleDeleteUpload(id: string) {
    deleteUploadSession(id)
    setUploads(getUploadSessions())
    setConfirmDeleteUploadId(null)
  }

  function formatDate(date: string) {
    const parsed = new Date(date)
    return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : parsed.toLocaleString()
  }

  // ── Tab button style ─────────────────────────────────────────────────────
  const tabBtn = (t: ActiveTab) => ({
    padding: '9px 22px',
    borderRadius: 10,
    border: '1px solid ' + (activeTab === t ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.1)'),
    background: activeTab === t ? 'rgba(139,92,246,0.15)' : 'transparent',
    color: activeTab === t ? 'var(--violet-soft)' : 'var(--text-dim)',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    fontWeight: activeTab === t ? 600 : 400,
    transition: 'all 0.2s',
  })

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Your practice archive</span>
          <h1>History</h1>
          <p>Review completed practice sessions and upload analysis reports saved in this browser.</p>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
          <button style={tabBtn('practice')} onClick={() => setActiveTab('practice')}>
            🎤 Practice sessions ({sessions.length})
          </button>
          <button style={tabBtn('uploads')} onClick={() => setActiveTab('uploads')}>
            📹 Upload reports ({uploads.length})
          </button>
        </div>

        {/* ══════ PRACTICE SESSIONS TAB ══════ */}
        {activeTab === 'practice' && (
          <>
            <div className="card" style={{ marginBottom: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <div>
                  <label htmlFor="history-search" style={{ display: 'block', marginBottom: 8 }}>Search by role</label>
                  <input id="history-search" className="input" type="search" placeholder="Search sessions..."
                    value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '100%' }} />
                </div>
                <div>
                  <label htmlFor="history-difficulty" style={{ display: 'block', marginBottom: 8 }}>Difficulty</label>
                  <select id="history-difficulty" className="input" value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)} style={{ width: '100%' }}>
                    <option value="All">All difficulties</option>
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.25rem' }}>Saved sessions ({filteredSessions.length})</h2>
              <Link className="btn btn-primary" to="/practice">New interview</Link>
            </div>

            {message && <p role="status" aria-live="polite" style={{ marginBottom: 16 }}>{message}</p>}

            {filteredSessions.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 36 }}>
                <h2>{sessions.length === 0 ? 'No completed interviews yet' : 'No matching sessions'}</h2>
                <p style={{ color: 'var(--text-dim)', margin: '12px 0 20px' }}>
                  {sessions.length === 0
                    ? 'Complete a practice interview and it will appear here.'
                    : 'Try another search or difficulty filter.'}
                </p>
                {sessions.length === 0
                  ? <Link className="btn btn-primary" to="/practice">Start practising</Link>
                  : <button className="btn btn-ghost" onClick={() => { setSearch(''); setDifficulty('All') }}>Clear filters</button>
                }
              </div>

            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                {filteredSessions.map((session) => {
                  const analyses = (session.analyses ?? []).filter((a) => a !== null)
                  const avgScore = analyses.length > 0
                    ? Math.round(analyses.reduce((s, a) => s + (a?.overall_score ?? 0), 0) / analyses.length)
                    : null
                  const scoreColor = avgScore !== null
                    ? avgScore >= 70 ? 'var(--green)' : avgScore >= 50 ? 'var(--amber)' : '#f87171'
                    : 'var(--text-dim)'

                  return (
                    <article className="card" key={session.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                        <div style={{ flex: 1 }}>
                          <span className="eyebrow">Practice session</span>
                          <h2 style={{ fontSize: '1.2rem', margin: '8px 0 4px' }}>{session.role}</h2>
                          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                            {session.difficulty} · {formatDate(session.completedAt)}
                          </p>
                          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: 4 }}>
                            {session.answers.filter((a) => a?.trim()).length}/{session.questions.length} questions answered
                          </p>
                        </div>
                        {avgScore !== null && (
                          <div style={{ textAlign: 'center', padding: '10px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: scoreColor }}>{avgScore}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>avg score</div>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
                        <Link className="btn btn-primary" to={`/report?id=${encodeURIComponent(session.id)}`}>View report</Link>
                        <button className="btn btn-ghost" onClick={() => setConfirmDeleteId(session.id)}>Delete</button>
                      </div>

                      {confirmDeleteId === session.id && (
                        <div style={{ borderTop: '1px solid var(--border)', marginTop: 18, paddingTop: 16 }}>
                          <p style={{ marginBottom: 12 }}>Delete this session and its report permanently?</p>
                          <div style={{ display: 'flex', gap: 10 }}>
                            <button className="btn btn-primary" onClick={() => handleDelete(session.id)}>Confirm delete</button>
                            <button className="btn btn-ghost" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </>
        )}


        {/* ══════ UPLOAD REPORTS TAB ══════ */}
        {activeTab === 'uploads' && (
          <>
            <div className="card" style={{ marginBottom: 24 }}>
              <input className="input" type="search" placeholder="Search by file name…"
                value={uploadSearch} onChange={(e) => setUploadSearch(e.target.value)}
                style={{ width: '100%', maxWidth: 360 }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.25rem' }}>Saved upload reports ({filteredUploads.length})</h2>
              <Link className="btn btn-primary" to="/upload">Upload recording</Link>
            </div>



            {filteredUploads.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 36 }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📹</div>
                <h2 style={{ marginBottom: 10 }}>{uploads.length === 0 ? 'No uploads yet' : 'No matching uploads'}</h2>
                <p style={{ color: 'var(--text-dim)', marginBottom: 20 }}>
                  {uploads.length === 0
                    ? 'Upload an interview recording and the report will be saved here automatically.'
                    : 'Try a different search term.'}
                </p>
                {uploads.length === 0 && <Link className="btn btn-primary" to="/upload">Upload recording</Link>}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                {filteredUploads.map((u) => {
                  const scoreColor = u.overallScore >= 70 ? 'var(--green)' : u.overallScore >= 50 ? 'var(--amber)' : '#f87171'
                  const completenessLabel =
                    u.dataCompleteness === 'full' ? '🟢 Full analysis'
                      : u.dataCompleteness === 'partial' ? '🟡 Partial'
                        : '⚪ Text only'


                  return (
                    <article className="card" key={u.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                        <div style={{ flex: 1 }}>
                          <span className="eyebrow">Upload report</span>
                          <h2 style={{ fontSize: '1.15rem', margin: '8px 0 4px' }}>
                            {u.hasVideo ? '📹' : '🎤'} {u.fileName}
                          </h2>
                          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                            {formatDate(u.savedAt)} · {completenessLabel}
                          </p>
                          {u.userNote && (
                            <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem', marginTop: 6, fontStyle: 'italic' }}>
                              📝 "{u.userNote.slice(0, 80)}{u.userNote.length > 80 ? '…' : ''}"
                            </p>
                          )}
                        </div>
                        <div style={{ textAlign: 'center', padding: '10px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: scoreColor }}>{u.overallScore}</div>
                          <div style={{ fontSize: '0.75rem', color: scoreColor }}>{u.overallGrade} · {u.overallLabel}</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
                        <Link className="btn btn-primary" to={`/upload-report?id=${encodeURIComponent(u.id)}`}>
                          View report
                        </Link>
                        <button className="btn btn-ghost" onClick={() => setConfirmDeleteUploadId(u.id)}>Delete</button>
                      </div>

                      {confirmDeleteUploadId === u.id && (
                        <div style={{ borderTop: '1px solid var(--border)', marginTop: 18, paddingTop: 16 }}>
                          <p style={{ marginBottom: 12 }}>Delete this upload report permanently?</p>
                          <div style={{ display: 'flex', gap: 10 }}>
                            <button className="btn btn-primary" onClick={() => handleDeleteUpload(u.id)}>Confirm delete</button>
                            <button className="btn btn-ghost" onClick={() => setConfirmDeleteUploadId(null)}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </>
        )}

        <p style={{ color: 'var(--text-dim)', marginTop: 24, fontSize: '0.85rem' }}>
          All data is stored locally in your browser. Clearing browser storage will remove it.
        </p>
      </div>
    </section>
  )
}

