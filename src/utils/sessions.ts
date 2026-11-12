
import type { AnswerAnalysisV2, QuestionBankItem } from './analysis'

// ── Data types ────────────────────────────────────────────────────────────────

/** Metadata attached to each question within a session */
export type SessionQuestion = {
  id: string | null          // question bank ID (null for legacy sessions)
  text: string
  topic: string
  subtopic: string
  difficulty: string
  type: string               // "Technical" | "HR" | "Behavioral"
  expected_concepts: string[]
}

/** Analysis result stored per answer. null = not yet analysed */
export type StoredAnalysis = {
  overall_score: number
  analysis_type: string
  model_available: boolean
  strengths: string[]
  improvement_suggestions: string[]
  concepts_covered: string[]
  concepts_to_revisit: string[]
  semantic_similarity: number | null
  semantic_interpretation: string | null
  dimensions: Array<{
    label: string
    value: number
    weight: number
    method: string
    strength: string | null
    suggestion: string | null
  }>
  word_count: number
  reference_outline: string | null
}

export type InterviewSession = {
  id: string
  role: string
  difficulty: string
  interviewType: string       // "Technical" | "HR" | "Mixed"
  questionMode: string        // "written" | "voice"

  // Support both old (string[]) and new (SessionQuestion[]) formats
  questions: string[] | SessionQuestion[]
  answers: string[]
  analyses: (StoredAnalysis | null)[]   // parallel to answers[]

  completedAt: string
  answeredCount: number
  totalQuestions: number

  // Adaptive session metadata
  adaptiveReasons?: string[]  // why each question was selected
  topicScores?: Record<string, number[]>
}

const STORAGE_KEY = 'intervue-ai-sessions-v1'

// ── Helpers ────────────────────────────────────────────────────────────────────

function questionText(q: string | SessionQuestion): string {
  return typeof q === 'string' ? q : q.text
}

export function getQuestionTexts(session: InterviewSession): string[] {
  return session.questions.map(questionText)
}

export function getQuestionMeta(
  session: InterviewSession,
  index: number,
): SessionQuestion | null {
  const q = session.questions[index]
  if (!q) return null
  if (typeof q === 'string') return null
  return q
}

/** Convert a QuestionBankItem to a SessionQuestion */
export function questionBankToSession(q: QuestionBankItem): SessionQuestion {
  return {
    id: q.id,
    text: q.text,
    topic: q.topic,
    subtopic: q.subtopic,
    difficulty: q.difficulty,
    type: q.type,
    expected_concepts: q.expected_concepts,
  }
}

/** Convert an AnalysisV2 result to a StoredAnalysis */
export function toStoredAnalysis(a: AnswerAnalysisV2): StoredAnalysis {
  return {
    overall_score: a.overall_score,
    analysis_type: a.analysis_type,
    model_available: a.model_available,
    strengths: a.strengths,
    improvement_suggestions: a.improvement_suggestions,
    concepts_covered: a.concepts_covered,
    concepts_to_revisit: a.concepts_to_revisit,
    semantic_similarity: a.semantic.similarity,
    semantic_interpretation: a.semantic.interpretation,
    dimensions: a.dimensions,
    word_count: a.word_count,
    reference_outline: a.reference_outline,
  }
}

// ── Storage operations ─────────────────────────────────────────────────────────

export function getSessions(): InterviewSession[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return []
    const parsed: unknown = JSON.parse(saved)
    if (!Array.isArray(parsed)) return []

    // Back-compat: ensure every session has the new fields
    return parsed.map((s: unknown) => {
      const raw = s as Record<string, unknown>
      return {
        ...raw,
        analyses: Array.isArray(raw['analyses'])
          ? raw['analyses']
          : new Array((raw['questions'] as unknown[])?.length ?? 0).fill(null),
        interviewType: raw['interviewType'] ?? 'Mixed',
        questionMode: raw['questionMode'] ?? 'written',
        totalQuestions:
          raw['totalQuestions'] ??
          (raw['questions'] as unknown[])?.length ??
          0,
        adaptiveReasons: raw['adaptiveReasons'] ?? [],
        topicScores: raw['topicScores'] ?? {},
      } as InterviewSession
    })
  } catch {
    return []
  }
}

export function saveSession(session: InterviewSession): void {
  const sessions = getSessions()
  const updated = [
    session,
    ...sessions.filter((item) => item.id !== session.id),
  ]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
}

export function updateSessionAnalysis(
  sessionId: string,
  answerIndex: number,
  analysis: StoredAnalysis,
): void {
  const sessions = getSessions()
  const idx = sessions.findIndex((s) => s.id === sessionId)
  if (idx === -1) return

  const session = { ...sessions[idx] }
  const analyses = [...(session.analyses ?? [])]
  analyses[answerIndex] = analysis
  session.analyses = analyses
  sessions[idx] = session

  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

export function deleteSession(id: string): void {
  const sessions = getSessions().filter((session) => session.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

export function getSessionById(id: string): InterviewSession | undefined {
  return getSessions().find((session) => session.id === id)
}

// ── Analytics helpers ──────────────────────────────────────────────────────────

/** Derive topic performance across all sessions */
export type TopicPerf = {
  topic: string
  attempts: number
  average_score: number
  recent_score: number | null   // most recent session's score for that topic
}

export function computeTopicPerformance(sessions: InterviewSession[]): TopicPerf[] {
  const map: Record<string, number[]> = {}

  for (const session of sessions) {
    for (let i = 0; i < session.questions.length; i++) {
      const meta = getQuestionMeta(session, i)
      const analysis = session.analyses?.[i]
      if (!meta || !analysis) continue

      const topic = meta.topic
      if (!map[topic]) map[topic] = []
      map[topic].push(analysis.overall_score)
    }
  }

  return Object.entries(map).map(([topic, scores]) => ({
    topic,
    attempts: scores.length,
    average_score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    recent_score: scores[scores.length - 1] ?? null,
  }))
}
