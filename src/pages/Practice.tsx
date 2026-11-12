
import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchQuestions,
  checkBackendHealth,
  type QuestionBankItem,
  type BackendHealth,
} from '../utils/analysis'
import {
  saveSession,
  questionBankToSession,
  type InterviewSession,
} from '../utils/sessions'

// ── Types ─────────────────────────────────────────────────────────────────────

type SetupConfig = {
  role: string
  difficulty: string
  interviewType: string    // "Technical" | "HR" | "Mixed"
  questionMode: string     // "written" | "voice"
  questionCount: number
  topic: string
}

type SpeechState = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'error'

const ROLES = [
  'Software Developer',
  'Frontend Developer',
  'Backend Developer',
  'Data Analyst',
  'Product Manager',
  'HR / Behavioral',
]

const TOPICS = ['Any', 'Python', 'DSA', 'SQL', 'JavaScript', 'React', 'Operating Systems', 'API Design', 'Databases', 'Statistics', 'General']
const DIFFICULTIES = ['Easy', 'Medium', 'Hard']
const INTERVIEW_TYPES = ['Technical', 'HR', 'Mixed']
const QUESTION_COUNTS = [3, 5, 7, 10]

// ── Voice recording hook ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionType = any

function useVoiceRecorder(onTranscript: (text: string) => void) {
  const [state, setState] = useState<SpeechState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const recognitionRef = useRef<SpeechRecognitionType | null>(null)
  const timerRef = useRef<number | null>(null)

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const start = useCallback(() => {
    if (!isSupported) {
      setError('Speech recognition is not supported in this browser. Please use Chrome or Edge.')
      setState('error')
      return
    }

    setState('requesting')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition
    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognitionRef.current = recognition

    let accumulated = ''

    recognition.onstart = () => {
      setState('recording')
      setRecordingSeconds(0)
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1)
      }, 1000)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transcript = Array.from(event.results)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r[0].transcript)
        .join(' ')
      accumulated = transcript
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      setError(`Recording error: ${event.error}. Please try again.`)
      setState('error')
      clearInterval(timerRef.current ?? 0)
    }

    recognition.onend = () => {
      clearInterval(timerRef.current ?? 0)
      setState('idle')
      if (accumulated.trim()) {
        onTranscript(accumulated.trim())
      }
    }

    try {
      recognition.start()
    } catch {
      setError('Could not start recording. Please allow microphone access.')
      setState('error')
    }
  }, [isSupported, onTranscript])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    clearInterval(timerRef.current ?? 0)
    setState('idle')
  }, [])

  const reset = useCallback(() => {
    stop()
    setError(null)
    setRecordingSeconds(0)
  }, [stop])

  return { state, error, recordingSeconds, isSupported, start, stop, reset }
}

// ── Setup Screen ──────────────────────────────────────────────────────────────

function SetupScreen({
  config,
  onConfigChange,
  onStart,
  backendHealth,
}: {
  config: SetupConfig
  onConfigChange: (partial: Partial<SetupConfig>) => void
  onStart: () => void
  backendHealth: BackendHealth | null
}) {
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const roleParam = searchParams.get('role')
    if (roleParam && ROLES.includes(roleParam)) {
      onConfigChange({ role: roleParam })
    }
  }, [searchParams, onConfigChange])

  return (
    <div className="card" style={{ maxWidth: 720, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 8 }}>Set up your session</h2>

      {backendHealth && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 20,
            background: backendHealth.model_available
              ? 'rgba(52,211,153,0.12)'
              : 'rgba(251,191,36,0.12)',
            border: `1px solid ${backendHealth.model_available ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.3)'}`,
            marginBottom: 24,
            fontSize: '0.82rem',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: backendHealth.model_available ? 'var(--green)' : 'var(--amber)',
              display: 'inline-block',
            }}
          />
          {backendHealth.model_available
            ? 'AI scoring active (semantic NLP)'
            : 'Rule-based scoring (AI model not loaded)'}
        </div>
      )}

      {!backendHealth && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 20,
            background: 'rgba(139,92,246,0.10)',
            border: '1px solid rgba(139,92,246,0.25)',
            marginBottom: 24,
            fontSize: '0.82rem',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--text-dim)',
              display: 'inline-block',
            }}
          />
          Connecting to analysis server…
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
        {/* Role */}
        <div>
          <label htmlFor="role" style={{ display: 'block', marginBottom: 8 }}>
            Interview role
          </label>
          <select
            id="role"
            className="input"
            value={config.role}
            onChange={(e) => onConfigChange({ role: e.target.value })}
            style={{ width: '100%' }}
          >
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>

        {/* Interview type */}
        <div>
          <label htmlFor="interview-type" style={{ display: 'block', marginBottom: 8 }}>
            Interview type
          </label>
          <select
            id="interview-type"
            className="input"
            value={config.interviewType}
            onChange={(e) => onConfigChange({ interviewType: e.target.value })}
            style={{ width: '100%' }}
          >
            {INTERVIEW_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>

        {/* Difficulty */}
        <div>
          <label htmlFor="difficulty" style={{ display: 'block', marginBottom: 8 }}>
            Starting difficulty
          </label>
          <select
            id="difficulty"
            className="input"
            value={config.difficulty}
            onChange={(e) => onConfigChange({ difficulty: e.target.value })}
            style={{ width: '100%' }}
          >
            {DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>

        {/* Topic focus */}
        <div>
          <label htmlFor="topic" style={{ display: 'block', marginBottom: 8 }}>
            Topic focus
          </label>
          <select
            id="topic"
            className="input"
            value={config.topic}
            onChange={(e) => onConfigChange({ topic: e.target.value })}
            style={{ width: '100%' }}
          >
            {TOPICS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>

        {/* Question count */}
        <div>
          <label htmlFor="question-count" style={{ display: 'block', marginBottom: 8 }}>
            Number of questions
          </label>
          <select
            id="question-count"
            className="input"
            value={config.questionCount}
            onChange={(e) => onConfigChange({ questionCount: Number(e.target.value) })}
            style={{ width: '100%' }}
          >
            {QUESTION_COUNTS.map((n) => (
              <option key={n} value={n}>{n} questions</option>
            ))}
          </select>
        </div>

        {/* Answer mode */}
        <div>
          <label htmlFor="question-mode" style={{ display: 'block', marginBottom: 8 }}>
            Answer mode
          </label>
          <select
            id="question-mode"
            className="input"
            value={config.questionMode}
            onChange={(e) => onConfigChange({ questionMode: e.target.value })}
            style={{ width: '100%' }}
          >
            <option value="written">Written (text)</option>
            <option value="voice">Voice (speech-to-text)</option>
          </select>
        </div>
      </div>

      <p style={{ color: 'var(--text-dim)', margin: '20px 0 24px', fontSize: '0.9rem' }}>
        Questions come from a curated question bank. Your answers will be analysed
        using {backendHealth?.model_available
          ? 'semantic NLP (sentence embeddings + concept coverage)'
          : 'a rule-based heuristic pipeline'} after the session.
      </p>

      <button className="btn btn-primary" onClick={onStart}>
        Start interview
      </button>
    </div>
  )
}

// ── Interview Screen ──────────────────────────────────────────────────────────

function InterviewScreen({
  config,
  questions,
  current,
  answers,
  adaptiveReasons,
  onAnswer,
  onPrev,
  onNext,
  onFinish,
  error,
}: {
  config: SetupConfig
  questions: QuestionBankItem[]
  current: number
  answers: string[]
  adaptiveReasons: string[]
  onAnswer: (text: string) => void
  onPrev: () => void
  onNext: () => void
  onFinish: () => void
  error: string
}) {
  const question = questions[current]
  const answer = answers[current] ?? ''
  const isLast = current === questions.length - 1
  const isFirst = current === 0

  const voice = useVoiceRecorder((transcript) => {
    onAnswer((answers[current] ? answers[current] + ' ' : '') + transcript)
  })

  if (!question) return null

  return (
    <div className="card" style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <span className="eyebrow">{config.role}</span>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
          {question.difficulty} · {question.topic}
        </span>
        <span>
          Question {current + 1} of {questions.length}
        </span>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 6,
          background: 'rgba(255,255,255,0.09)',
          borderRadius: 20,
          overflow: 'hidden',
          marginBottom: 24,
        }}
      >
        <div
          style={{
            width: `${((current + 1) / questions.length) * 100}%`,
            height: '100%',
            background: 'var(--grad)',
            transition: 'width 0.4s ease',
          }}
        />
      </div>

      {/* Adaptive reason */}
      {adaptiveReasons[current] && (
        <div
          style={{
            padding: '8px 14px',
            borderRadius: 10,
            background: 'rgba(139,92,246,0.10)',
            border: '1px solid rgba(139,92,246,0.2)',
            fontSize: '0.82rem',
            color: 'var(--text-dim)',
            marginBottom: 16,
          }}
        >
          <strong style={{ color: 'var(--violet-soft)' }}>Why this question: </strong>
          {adaptiveReasons[current]}
        </div>
      )}

      {/* Question text */}
      <h2 style={{ fontSize: '1.4rem', marginBottom: 24, lineHeight: 1.4 }}>
        {question.text}
      </h2>

      {/* Concept hints (collapsed by default) */}
      {question.expected_concepts.length > 0 && (
        <details style={{ marginBottom: 16 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-dim)', fontSize: '0.85rem', userSelect: 'none' }}>
            Show concept hints ({question.expected_concepts.length} key concepts)
          </summary>
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {question.expected_concepts.map((c) => (
              <span
                key={c}
                style={{
                  padding: '3px 10px',
                  borderRadius: 20,
                  background: 'rgba(139,92,246,0.12)',
                  border: '1px solid rgba(139,92,246,0.25)',
                  fontSize: '0.8rem',
                }}
              >
                {c}
              </span>
            ))}
          </div>
        </details>
      )}

      {/* Answer area */}
      <label htmlFor="answer" style={{ display: 'block', marginBottom: 10 }}>
        Your answer
        {config.questionMode === 'voice' && (
          <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginLeft: 8 }}>
            (edit transcript below)
          </span>
        )}
      </label>

      {/* Voice controls */}
      {config.questionMode === 'voice' && (
        <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {voice.isSupported ? (
            <>
              {voice.state === 'idle' || voice.state === 'error' ? (
                <button
                  className="btn btn-ghost"
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  onClick={voice.start}
                >
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: 'var(--violet)', display: 'inline-block',
                  }} />
                  Start recording
                </button>
              ) : (
                <button
                  className="btn btn-ghost"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    borderColor: '#ef4444', color: '#ef4444',
                  }}
                  onClick={voice.stop}
                >
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#ef4444', display: 'inline-block',
                    animation: 'pulse 1.2s ease-in-out infinite',
                  }} />
                  Stop ({voice.recordingSeconds}s)
                </button>
              )}
              {voice.error && (
                <span style={{ color: '#ef4444', fontSize: '0.85rem' }}>{voice.error}</span>
              )}
            </>
          ) : (
            <span style={{ color: 'var(--amber)', fontSize: '0.85rem' }}>
              Voice input not supported in this browser. Use Chrome or Edge, or switch to Written mode.
            </span>
          )}
        </div>
      )}

      <textarea
        id="answer"
        className="input"
        value={answer}
        onChange={(e) => onAnswer(e.target.value)}
        placeholder={
          config.questionMode === 'voice'
            ? 'Record your answer or type here...'
            : 'Write your answer here...'
        }
        rows={8}
        style={{ width: '100%', resize: 'vertical', marginBottom: 8 }}
      />
      <p style={{ color: 'var(--text-faint)', fontSize: '0.8rem', marginBottom: 20 }}>
        {answer.trim().split(/\s+/).filter(Boolean).length} words
        {answer.trim() === '' && ' · Answer will be scored after the session'}
      </p>

      {error && (
        <p role="alert" style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>
      )}

      {/* Navigation */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <button
          className="btn btn-ghost"
          onClick={onPrev}
          disabled={isFirst}
        >
          Previous
        </button>

        {!isLast ? (
          <button className="btn btn-primary" onClick={onNext}>
            Next question
          </button>
        ) : (
          <button className="btn btn-primary" onClick={onFinish}>
            Finish and view report
          </button>
        )}
      </div>
    </div>
  )
}

// ── Question Selection Helper ──────────────────────────────────────────────────

function selectSessionQuestions(
  pool: QuestionBankItem[],
  config: SetupConfig,
): { questions: QuestionBankItem[]; reasons: string[] } {
  const targetCount = config.questionCount

  // 1. Primary filter by role (case-insensitive)
  const rolePool = pool.filter(
    (q) => q.role.toLowerCase() === config.role.toLowerCase(),
  )
  const basePool = rolePool.length > 0 ? rolePool : pool

  // Matching helpers
  const matchesTopic = (q: QuestionBankItem) =>
    config.topic === 'Any' || q.topic.toLowerCase() === config.topic.toLowerCase()

  const matchesType = (q: QuestionBankItem) => {
    if (config.interviewType === 'Mixed') return true
    if (config.interviewType === 'HR') return q.type === 'HR' || q.type === 'Behavioral'
    return q.type.toLowerCase() === config.interviewType.toLowerCase()
  }

  const matchesDiff = (q: QuestionBankItem) =>
    config.difficulty === 'Any' || q.difficulty.toLowerCase() === config.difficulty.toLowerCase()

  const shuffle = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5)

  // Prioritized tiers
  const tier1 = basePool.filter((q) => matchesTopic(q) && matchesType(q) && matchesDiff(q))
  const tier2 = basePool.filter((q) => matchesTopic(q) && matchesType(q) && !matchesDiff(q))
  const tier3 = basePool.filter((q) => matchesTopic(q) && !matchesType(q))
  const tier4 = basePool.filter((q) => !matchesTopic(q) && matchesType(q) && matchesDiff(q))
  const tier5 = basePool.filter((q) => !matchesTopic(q) && matchesType(q) && !matchesDiff(q))
  const tier6 = basePool.filter((q) => !matchesTopic(q) && !matchesType(q))

  // Global fallback if basePool still has fewer than targetCount
  const tierFallback = pool.filter((q) => !basePool.some((b) => b.id === q.id))

  const selected: QuestionBankItem[] = []
  const seenIds = new Set<string>()

  for (const tier of [tier1, tier2, tier3, tier4, tier5, tier6, tierFallback]) {
    for (const q of shuffle(tier)) {
      if (!seenIds.has(q.id)) {
        seenIds.add(q.id)
        selected.push(q)
        if (selected.length >= targetCount) break
      }
    }
    if (selected.length >= targetCount) break
  }

  // Generate adaptive / explanatory reasons for each question
  const reasons = selected.map((q) => {
    if (config.topic !== 'Any' && q.topic.toLowerCase() === config.topic.toLowerCase()) {
      return `Selected for ${q.topic} focus (${q.difficulty} · ${q.type})`
    }
    if (q.difficulty.toLowerCase() === config.difficulty.toLowerCase()) {
      return `Targeted ${q.difficulty} level question for ${q.role}`
    }
    if (q.type === 'Behavioral' || q.type === 'HR') {
      return `Assessing behavioral & communication skills for ${q.role}`
    }
    return `Core interview question on ${q.topic} (${q.difficulty})`
  })

  return { questions: selected, reasons }
}

// ── Main Practice Component ───────────────────────────────────────────────────

export default function Practice() {
  const navigate = useNavigate()

  const [config, setConfig] = useState<SetupConfig>({
    role: 'Software Developer',
    difficulty: 'Easy',
    interviewType: 'Mixed',
    questionMode: 'written',
    questionCount: 5,
    topic: 'Any',
  })

  const [phase, setPhase] = useState<'setup' | 'interview' | 'loading'>('setup')
  const [questions, setQuestions] = useState<QuestionBankItem[]>([])
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [adaptiveReasons, setAdaptiveReasons] = useState<string[]>([])
  const [topicScores] = useState<Record<string, number[]>>({})
  const [error, setError] = useState('')
  const [backendHealth, setBackendHealth] = useState<BackendHealth | null>(null)

  // Check backend health on mount
  useEffect(() => {
    checkBackendHealth()
      .then(setBackendHealth)
      .catch(() => setBackendHealth(null))
  }, [])

  async function startSession() {
    setPhase('loading')
    setError('')

    try {
      let pool: QuestionBankItem[] = []

      // Try fetching from backend first
      try {
        const remote = await fetchQuestions({ limit: 200 })
        if (Array.isArray(remote) && remote.length > 0) {
          pool = remote
        }
      } catch {
        // Backend offline — fall through to local bank
      }

      // If backend was offline or empty, load bundled local question bank
      if (pool.length === 0) {
        const { default: localBank } = await import('../data/question_bank.json')
        pool = localBank as unknown as QuestionBankItem[]
      }

      if (!pool || pool.length === 0) {
        setError('No questions found in question bank.')
        setPhase('setup')
        return
      }

      const { questions: picked, reasons } = selectSessionQuestions(pool, config)

      if (picked.length === 0) {
        setError('Could not find matching questions. Please try different filters.')
        setPhase('setup')
        return
      }

      setQuestions(picked)
      setAdaptiveReasons(reasons)
      setAnswers(new Array(picked.length).fill(''))
      setCurrent(0)
      setPhase('interview')
    } catch (err) {
      console.error('startSession failed:', err)
      setError('Could not load questions. Check the browser console for details.')
      setPhase('setup')
    }
  }

  function handleNext() {
    if (current < questions.length - 1) {
      setCurrent((c) => c + 1)
    }
  }

  function handlePrev() {
    if (current > 0) {
      setCurrent((c) => c - 1)
    }
  }

  function updateAnswer(text: string) {
    setAnswers((prev) => {
      const updated = [...prev]
      updated[current] = text
      return updated
    })
  }

  function finishPractice() {
    const sessionQuestions = questions.map(questionBankToSession)

    const session: InterviewSession = {
      id: crypto.randomUUID(),
      role: config.role,
      difficulty: config.difficulty,
      interviewType: config.interviewType,
      questionMode: config.questionMode,
      questions: sessionQuestions,
      answers,
      analyses: new Array(questions.length).fill(null),
      completedAt: new Date().toISOString(),
      answeredCount: answers.filter((a) => a?.trim()).length,
      totalQuestions: questions.length,
      adaptiveReasons,
      topicScores,
    }

    try {
      saveSession(session)
      navigate(`/report?id=${encodeURIComponent(session.id)}`)
    } catch {
      setError('Could not save this session. Check browser storage and try again.')
    }
  }

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Interview training</span>
          <h1>Practice interview</h1>
          <p>
            Answer realistic questions from a curated bank, review your responses,
            and get AI-powered analysis in your report.
          </p>
        </div>

        {error && phase === 'setup' && (
          <div
            role="alert"
            style={{
              padding: '12px 18px',
              borderRadius: 10,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              marginBottom: 20,
              maxWidth: 720,
              margin: '0 auto 20px',
            }}
          >
            {error}
          </div>
        )}

        {phase === 'setup' && (
          <SetupScreen
            config={config}
            onConfigChange={(partial) => setConfig((prev) => ({ ...prev, ...partial }))}
            onStart={startSession}
            backendHealth={backendHealth}
          />
        )}

        {phase === 'loading' && (
          <div className="card" style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center', padding: 48 }}>
            <div style={{ marginBottom: 16, fontSize: '1.2rem' }}>
              Loading your interview…
            </div>
            <p style={{ color: 'var(--text-dim)' }}>
              Selecting questions from the question bank.
            </p>
          </div>
        )}

        {phase === 'interview' && (
          <InterviewScreen
            config={config}
            questions={questions}
            current={current}
            answers={answers}
            adaptiveReasons={adaptiveReasons}
            onAnswer={updateAnswer}
            onPrev={handlePrev}
            onNext={handleNext}
            onFinish={finishPractice}
            error={error}
          />
        )}

        <div style={{ marginTop: 24 }}>
          <Link className="btn btn-ghost" to="/dashboard">
            Back to dashboard
          </Link>
        </div>
      </div>
    </section>
  )
}
