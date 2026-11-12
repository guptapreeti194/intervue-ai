/**
 * InterVue AI — Upload Session Storage
 * ======================================
 * Persists upload-pipeline analysis results in localStorage.
 * Separate from practice sessions (sessions.ts) for clean separation.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type UploadCategoryResult = {
  label: string
  score: number
  weight: number
  weighted_score: number
  sub_scores: Record<string, unknown>
  strengths: string[]
  suggestions: string[]
  data_source: string
}

export type UploadSpeechResult = {
  word_count: number
  unique_word_count: number
  sentence_count: number
  type_token_ratio: number
  estimated_duration_sec: number
  wpm: number
  wpm_score: number
  wpm_label: string
  wpm_note: string
  total_filler_count: number
  filler_details: { word: string; count: number }[]
  filler_score: number
  filler_note: string
  pause_analysis: {
    estimated_count: number
    estimated_avg_duration_sec: number
    source: string
    note: string
  }
  repeated_phrases: { phrase: string; count: number; type: string }[]
  repetition_score: number
  answer_length_label: string
  answer_length_score: number
  consistency_score: number
  speech_score: number
  speech_score_formula: string
  strengths: string[]
  suggestions: string[]
  source: string
}

export type UploadVisionResult = {
  face_visibility_pct: number
  face_visibility_score: number
  eye_contact_pct: number
  eye_contact_score: number
  eye_contact_method: string
  head_movement_label: string
  head_movement_score: number
  head_movement_std: number
  posture_score: number
  posture_label: string
  avg_brightness: number
  lighting_quality: string
  lighting_score: number
  non_verbal_score: number
  non_verbal_score_formula: string
  frames_analysed: number
  video_duration_sec: number
  analysis_method: string
  strengths: string[]
  suggestions: string[]
}

/** A fully saved upload analysis session */
export type UploadSession = {
  id: string                        // uuid from backend
  savedAt: string                   // ISO timestamp

  // File info
  fileName: string
  fileType: string
  hasVideo: boolean
  hasAudio: boolean

  // Overall scores
  overallScore: number
  overallGrade: string
  overallLabel: string

  // Category breakdown
  categories: UploadCategoryResult[]

  // Module results
  speech: UploadSpeechResult | null
  vision: UploadVisionResult | null

  // Insights
  topStrength: string
  topSuggestion: string
  formula: string
  dataCompleteness: string          // "full" | "partial" | "text_only"

  // Transcript
  transcript: string | null

  // Optional: custom note added by user
  userNote?: string
}

// ── Storage key ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'intervue-ai-uploads-v1'

// ── CRUD operations ───────────────────────────────────────────────────────────

export function getUploadSessions(): UploadSession[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return []
    const parsed: unknown = JSON.parse(saved)
    if (!Array.isArray(parsed)) return []
    return parsed as UploadSession[]
  } catch {
    return []
  }
}

export function saveUploadSession(session: UploadSession): void {
  const existing = getUploadSessions()
  // Replace if same ID already exists (re-save after editing note)
  const updated = [
    session,
    ...existing.filter((s) => s.id !== session.id),
  ]
  // Cap at 50 saved upload sessions to keep localStorage size manageable
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated.slice(0, 50)))
}

export function getUploadSessionById(id: string): UploadSession | undefined {
  return getUploadSessions().find((s) => s.id === id)
}

export function deleteUploadSession(id: string): void {
  const updated = getUploadSessions().filter((s) => s.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
}

export function updateUploadNote(id: string, note: string): void {
  const sessions = getUploadSessions()
  const idx = sessions.findIndex((s) => s.id === id)
  if (idx === -1) return
  sessions[idx] = { ...sessions[idx], userNote: note }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

// ── Helper: build UploadSession from raw API response ────────────────────────

export function buildUploadSession(
  apiResponse: Record<string, unknown>,
): UploadSession {
  return {
    id: (apiResponse['session_id'] as string) ?? crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    fileName: (apiResponse['file_name'] as string) ?? 'unknown',
    fileType: (apiResponse['file_type'] as string) ?? '',
    hasVideo: (apiResponse['has_video'] as boolean) ?? false,
    hasAudio: (apiResponse['has_audio'] as boolean) ?? false,
    overallScore: (apiResponse['overall_score'] as number) ?? 0,
    overallGrade: (apiResponse['overall_grade'] as string) ?? '—',
    overallLabel: (apiResponse['overall_label'] as string) ?? '—',
    categories: (apiResponse['categories'] as UploadCategoryResult[]) ?? [],
    speech: (apiResponse['speech'] as UploadSpeechResult | null) ?? null,
    vision: (apiResponse['vision'] as UploadVisionResult | null) ?? null,
    topStrength: (apiResponse['top_strength'] as string) ?? '',
    topSuggestion: (apiResponse['top_suggestion'] as string) ?? '',
    formula: (apiResponse['formula'] as string) ?? '',
    dataCompleteness: (apiResponse['data_completeness'] as string) ?? 'text_only',
    transcript: (apiResponse['transcript'] as string | null) ?? null,
    userNote: '',
  }
}
