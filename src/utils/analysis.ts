
// ── Session types ─────────────────────────────────────────────────────────────

export type CategoryScore = {
  label: string
  value: number
  strength: string | null
  suggestion: string | null
}

/** Original rule-based analysis result (v1 endpoint) */
export type AnswerAnalysis = {
  word_count: number
  overall_score: number
  categories: CategoryScore[]
  strengths: string[]
  suggestions: string[]
  analysis_type: string
}

/** Rubric dimension from v2 endpoint */
export type DimensionScore = {
  label: string
  value: number
  weight: number
  method: string
  strength: string | null
  suggestion: string | null
}

/** Semantic similarity result from v2 endpoint */
export type SemanticResult = {
  available: boolean
  similarity: number | null
  interpretation: string
  limitation: string
}

/** Single concept coverage detail */
export type ConceptDetail = {
  concept: string
  covered: boolean
  method: string
  similarity: number
  excerpt: string | null
}

/** Full v2 analysis result */
export type AnswerAnalysisV2 = {
  word_count: number
  overall_score: number
  overall_score_formula: string
  dimensions: DimensionScore[]
  semantic: SemanticResult
  concepts_covered: string[]
  concepts_to_revisit: string[]
  concept_details: ConceptDetail[]
  strengths: string[]
  improvement_suggestions: string[]
  reference_outline: string | null
  analysis_type: string
  model_available: boolean
  speech_metrics: {
    word_count: number
    filler_count: number
    filler_words_found: string[]
    estimated_wpm: number | null
    is_very_short: boolean
    is_very_long: boolean
    notes: string[]
  } | null
}

const API_BASE_URL = 'http://localhost:8000'

// ── Original analysis (preserved) ─────────────────────────────────────────────

export async function analyzeAnswer(
  question: string,
  answer: string,
): Promise<AnswerAnalysis> {
  const response = await fetch(`${API_BASE_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, answer }),
  })
  if (!response.ok) {
    throw new Error(`Analysis failed with status ${response.status}`)
  }
  return response.json() as Promise<AnswerAnalysis>
}

// ── V2 ML Analysis ────────────────────────────────────────────────────────────

export type AnalyzeV2Options = {
  questionId?: string
  expectedConcepts?: string[]
  referenceAnswer?: string
  durationSeconds?: number
}

export async function analyzeAnswerV2(
  question: string,
  answer: string,
  options: AnalyzeV2Options = {},
): Promise<AnswerAnalysisV2> {
  const body: Record<string, unknown> = { question, answer }
  if (options.questionId) body['question_id'] = options.questionId
  if (options.expectedConcepts) body['expected_concepts'] = options.expectedConcepts
  if (options.referenceAnswer) body['reference_answer'] = options.referenceAnswer
  if (options.durationSeconds !== undefined) body['duration_seconds'] = options.durationSeconds

  const response = await fetch(`${API_BASE_URL}/analyze/v2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Analysis v2 failed (${response.status}): ${text}`)
  }

  return response.json() as Promise<AnswerAnalysisV2>
}

// ── Backend health check ──────────────────────────────────────────────────────

export type BackendHealth = {
  status: string
  model_available: boolean
  model_name: string | null
  analysis_mode: string
}

export async function checkBackendHealth(): Promise<BackendHealth> {
  const response = await fetch(`${API_BASE_URL}/health`, {
    signal: AbortSignal.timeout(4000),
  })
  if (!response.ok) throw new Error(`Health check failed: ${response.status}`)
  return response.json() as Promise<BackendHealth>
}

// ── Question bank ─────────────────────────────────────────────────────────────

export type QuestionBankItem = {
  id: string
  text: string
  role: string
  topic: string
  subtopic: string
  difficulty: string
  type: string
  expected_concepts: string[]
  reference_answer: string
  rubric_hints: string[]
  follow_ups: string[]
  source: string
}

export async function fetchQuestions(params: {
  role?: string
  difficulty?: string
  topic?: string
  type?: string
  limit?: number
}): Promise<QuestionBankItem[]> {
  const url = new URL(`${API_BASE_URL}/questions`)
  if (params.role) url.searchParams.set('role', params.role)
  if (params.difficulty) url.searchParams.set('difficulty', params.difficulty)
  if (params.topic) url.searchParams.set('topic', params.topic)
  if (params.type) url.searchParams.set('type', params.type)
  if (params.limit) url.searchParams.set('limit', String(params.limit))

  const response = await fetch(url.toString())
  if (!response.ok) throw new Error(`Failed to fetch questions: ${response.status}`)
  return response.json() as Promise<QuestionBankItem[]>
}

// ── Adaptive next question ────────────────────────────────────────────────────

export type AdaptiveNextRequest = {
  role: string
  current_difficulty: string
  answered_question_ids: string[]
  topic_scores?: Record<string, number[]>
  last_score?: number
  last_question_id?: string
  prefer_follow_up?: boolean
}

export type AdaptiveNextResponse = {
  question: QuestionBankItem | null
  reason: string
  difficulty_change: string
  target_topic: string | null
  no_more_questions: boolean
}

export async function fetchNextQuestion(
  request: AdaptiveNextRequest,
): Promise<AdaptiveNextResponse> {
  const response = await fetch(`${API_BASE_URL}/next-question`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) throw new Error(`Next question failed: ${response.status}`)
  return response.json() as Promise<AdaptiveNextResponse>
}
