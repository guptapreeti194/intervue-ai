
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getSessions } from '../utils/sessions'
import DemoBadge from '../components/DemoBadge'

export default function Dashboard() {
  const sessions = useMemo(() => getSessions(), [])

  const totalSessions = sessions.length

  const totalAnswered = sessions.reduce(
    (total, session) => total + session.answers.filter(
      (answer) => answer?.trim(),
    ).length,
    0,
  )

  const totalQuestions = sessions.reduce(
    (total, session) => total + session.questions.length,
    0,
  )

  const completionRate = totalQuestions
    ? Math.round((totalAnswered / totalQuestions) * 100)
    : 0

  const latestSessions = sessions.slice(0, 3)

  const roleCounts = sessions.reduce<Record<string, number>>(
    (counts, session) => {
      counts[session.role] = (counts[session.role] ?? 0) + 1
      return counts
    },
    {},
  )

  const mostPracticedRole = Object.entries(roleCounts).sort(
    (a, b) => b[1] - a[1],
  )[0]

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Your workspace</span>
          <h1>Dashboard</h1>
          <p>
            Track your interview practice, review previous answers,
            and prepare for your next opportunity.
          </p>
        </div>

        <div
          className="features"
          style={{ marginBottom: 28 }}
        >
          <div className="card">
            <p style={{ color: 'var(--text-dim)' }}>
              Practice sessions
            </p>
            <h2 style={{ fontSize: '2rem', marginTop: 10 }}>
              {totalSessions}
            </h2>
            <p style={{ color: 'var(--text-dim)', marginTop: 8 }}>
              Saved in this browser
            </p>
          </div>

          <div className="card">
            <p style={{ color: 'var(--text-dim)' }}>
              Questions answered
            </p>
            <h2 style={{ fontSize: '2rem', marginTop: 10 }}>
              {totalAnswered}
            </h2>
            <p style={{ color: 'var(--text-dim)', marginTop: 8 }}>
              Across all saved sessions
            </p>
          </div>

          <div className="card">
            <p style={{ color: 'var(--text-dim)' }}>
              Answer completion
            </p>
            <h2 style={{ fontSize: '2rem', marginTop: 10 }}>
              {completionRate}%
            </h2>
            <p style={{ color: 'var(--text-dim)', marginTop: 8 }}>
              Answers submitted out of all session questions
            </p>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 28 }}>
          <span className="eyebrow">Your focus</span>
          <h2 style={{ margin: '12px 0' }}>
            {mostPracticedRole
              ? mostPracticedRole[0]
              : 'Choose your first interview'}
          </h2>
          <p style={{ color: 'var(--text-dim)', marginBottom: 20 }}>
            {mostPracticedRole
              ? `You have ${mostPracticedRole[1]} saved session(s) for this interview type.`
              : 'Start a practice session to begin building your interview history.'}
          </p>
          <Link className="btn btn-primary" to="/practice">
            Start practicing
          </Link>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <h2 style={{ fontSize: '1.4rem' }}>Recent sessions</h2>
          <Link className="btn btn-ghost" to="/history">
            View all history
          </Link>
        </div>

        {latestSessions.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <h3>No practice sessions yet</h3>
            <p style={{ color: 'var(--text-dim)', margin: '12px 0 20px' }}>
              Your saved interviews will appear here after you finish
              your first practice session.
            </p>
            <Link className="btn btn-primary" to="/practice">
              Start your first interview
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {latestSessions.map((session) => {
              const answered = session.answers.filter(
                (answer) => answer?.trim(),
              ).length

              return (
                <article className="card" key={session.id}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 16,
                    }}
                  >
                    <div>
                      <span className="eyebrow">
                        {session.difficulty} difficulty
                      </span>
                      <h3 style={{ margin: '10px 0' }}>
                        {session.role}
                      </h3>
                      <p style={{ color: 'var(--text-dim)' }}>
                        {new Date(session.completedAt).toLocaleString()}
                      </p>
                    </div>

                    <div>
                      <strong>
                        {answered}/{session.questions.length}
                      </strong>
                      <p style={{ color: 'var(--text-dim)' }}>
                        Questions answered
                      </p>
                    </div>
                  </div>

                  <div style={{ marginTop: 18 }}>
                    <Link
                      className="btn btn-primary"
                      to={`/report?id=${encodeURIComponent(session.id)}`}
                    >
                      Review report
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: 28 }}>
          <DemoBadge />
          <p style={{ color: 'var(--text-dim)', marginTop: 12 }}>
            Dashboard statistics come from your saved browser sessions.
            AI-generated performance scores are not available yet.
          </p>
        </div>
      </div>
    </section>
  )
}
