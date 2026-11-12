import type { ReactNode } from 'react'
import Button from '../components/Button'
import DemoBadge from '../components/DemoBadge'

const categories = [
  { label: 'Clarity', value: 86 },
  { label: 'Structure', value: 78 },
  { label: 'Relevance', value: 84 },
  { label: 'Confidence', value: 74 },
  { label: 'Pacing', value: 81 },
]

const SAMPLE_SCORE = 82
const RING_CIRCUMFERENCE = 339.29

const waveBars = Array.from({ length: 30 }, (_, i) => ({
  h: `${24 + Math.round(Math.abs(Math.sin(i * 0.9)) * 76)}%`,
  d: `${(i % 10) * 0.12}s`,
}))

const stats = [
  { value: '5', label: 'Skill categories scored' },
  { value: '3', label: 'Difficulty levels' },
  { value: '6', label: 'Role tracks' },
  { value: '0', label: 'API keys needed' },
]

const steps = [
  {
    title: 'Choose your target',
    text: 'Pick the role you are interviewing for and a difficulty level that matches where you are today.',
  },
  {
    title: 'Answer one question at a time',
    text: 'Type your answer or use the browser recording interface, just like a real interview, one question at a time.',
  },
  {
    title: 'Review your report',
    text: 'See category scores and concrete improvement tips. In this version, results are simulated demo output.',
  },
]

type Feature = { title: string; text: string; icon: ReactNode }

const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const features: Feature[] = [
  {
    title: 'Role-based questions',
    text: 'Question sets tailored to the role you choose, from frontend to data and product.',
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    ),
  },
  {
    title: 'Adjustable difficulty',
    text: 'Start gently, then ramp up to tougher, more open-ended questions as you improve.',
    icon: (
      <svg {...iconProps}>
        <path d="M4 20V14M10 20V9M16 20V5M22 20H2" />
      </svg>
    ),
  },
  {
    title: 'Text or voice practice',
    text: 'Write your answers, or try the recording interface in browsers that support it.',
    icon: (
      <svg {...iconProps}>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
    ),
  },
  {
    title: 'Category scoring',
    text: 'Understand your strengths and gaps across clarity, structure, relevance, confidence and pacing.',
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    title: 'Actionable tips',
    text: 'Every report ends with specific, practical suggestions you can apply to your next attempt.',
    icon: (
      <svg {...iconProps}>
        <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2v.3h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" />
      </svg>
    ),
  },
  {
    title: 'Searchable history',
    text: 'Look back at past sessions, search them, and delete the ones you no longer want.',
    icon: (
      <svg {...iconProps}>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
    ),
  },
]

const roles = [
  'Frontend Developer',
  'Backend Developer',
  'Full-Stack Developer',
  'Data Analyst',
  'Product Manager',
  'HR / Behavioral',
]

export default function Landing() {
  return (
    <>
      {/* HERO */}
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="pill reveal">
              <i /> Interview coaching, built for students
            </span>
            <h1 className="reveal d1">
              Practice like it's real.
              <br />
              <span className="grad-text">Improve like it's measured.</span>
            </h1>
            <p className="hero-lead reveal d2">
              InterVue AI helps you rehearse interview answers, then turns each session
              into a clear report with category scores and tips for your next attempt.
            </p>
            <div className="hero-actions reveal d3">
              <Button to="/practice" size="lg">
                Start a practice interview
              </Button>
              <Button to="/report" variant="ghost" size="lg">
                See a sample report
              </Button>
            </div>
            <p className="hero-note reveal d3">
              Version 1 runs entirely in your browser on local demo data. Scores are
              simulated, and no recordings are uploaded or analyzed.
            </p>
          </div>

          <div className="hero-visual reveal d2">
            <div className="preview-card" role="img" aria-label="Sample report preview showing an overall demo score of 82 out of 100 with five category bars">
              <div className="preview-top">
                <div>
                  <div className="preview-title">Sample session report</div>
                  <div className="preview-sub">Frontend Developer · Medium</div>
                </div>
                <DemoBadge label="Demo result" />
              </div>

              <div className="preview-body">
                <div className="ring">
                  <svg width="130" height="130" viewBox="0 0 130 130">
                    <defs>
                      <linearGradient id="ring-grad" x1="0" y1="0" x2="130" y2="130" gradientUnits="userSpaceOnUse">
                        <stop offset="0" stopColor="#8b5cf6" />
                        <stop offset="1" stopColor="#22d3ee" />
                      </linearGradient>
                    </defs>
                    <circle cx="65" cy="65" r="54" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
                    <circle
                      className="ring-fill"
                      cx="65"
                      cy="65"
                      r="54"
                      fill="none"
                      stroke="url(#ring-grad)"
                      strokeWidth="10"
                      strokeLinecap="round"
                      style={
                        {
                          '--offset': RING_CIRCUMFERENCE * (1 - SAMPLE_SCORE / 100),
                        } as React.CSSProperties
                      }
                    />
                  </svg>
                  <div className="ring-center">
                    <strong>{SAMPLE_SCORE}</strong>
                    <span>Overall</span>
                  </div>
                </div>

                <div className="bars">
                  {categories.map((c) => (
                    <div className="bar-row" key={c.label}>
                      <div className="bar-label">
                        <span>{c.label}</span>
                        <span>{c.value}</span>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{ '--w': `${c.value}%` } as React.CSSProperties}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="wave" aria-hidden="true">
                {waveBars.map((b, i) => (
                  <span key={i} style={{ '--h': b.h, '--d': b.d } as React.CSSProperties} />
                ))}
              </div>
              <div className="preview-foot">
                Illustration only. Not generated from a real recording.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="container">
        <div className="stats">
          {stats.map((s) => (
            <div className="stat" key={s.label}>
              <strong className="grad-text">{s.value}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section" id="how-it-works">
        <div className="container">
          <div className="section-head center">
            <span className="eyebrow">How it works</span>
            <h2>From first answer to focused feedback</h2>
            <p>Three simple steps, designed to feel like a real interview loop.</p>
          </div>
          <div className="steps">
            {steps.map((s, i) => (
              <article className="card step" key={s.title}>
                <div className="step-num">{i + 1}</div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="section" id="features" style={{ paddingTop: 20 }}>
        <div className="container">
          <div className="section-head center">
            <span className="eyebrow">Features</span>
            <h2>Everything you need to rehearse with intent</h2>
            <p>Built around the way real candidates actually prepare.</p>
          </div>
          <div className="features">
            {features.map((f) => (
              <article className="card feature" key={f.title}>
                <div className="feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ROLES */}
      <section className="section" style={{ paddingTop: 20 }}>
        <div className="container">
          <div className="section-head center">
            <span className="eyebrow">Role tracks</span>
            <h2>Pick the interview you're preparing for</h2>
            <p>Choose a role to jump straight into a practice session.</p>
          </div>
          <div className="roles">
            {roles.map((r) => (
              <Button
                key={r}
                to={`/practice?role=${encodeURIComponent(r)}`}
                variant="ghost"
                size="sm"
                className="role-chip"
              >
                {r}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container" style={{ paddingBottom: 30 }}>
        <div className="cta-box">
          <h2>
            Ready for your <span className="grad-text">first session?</span>
          </h2>
          <p>
            It takes a few minutes, needs no account and no API key, and everything stays
            in your browser.
          </p>
          <Button to="/practice" size="lg">
            Start practicing now
          </Button>
        </div>
      </section>
    </>
  )
}