"""
InterVue AI – FastAPI backend  v3.0
====================================

Endpoints
---------
GET  /              → health check / welcome
GET  /health        → {"status": "ok", "model_available": bool}
GET  /questions     → list questions (filter by role, difficulty, topic, type)
GET  /questions/{id}→ single question by ID

POST /analyze       → original rule-based result (preserved for backward compat)
POST /analyze/v2    → full NLP/ML analysis (semantic + rubric + concepts)
POST /next-question → adaptive question selection
POST /session/score → skill profile update (compute topic summary from array of analyses)
POST /transcribe/speech-metrics → communication metrics from transcript
"""

import logging
import re
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ── Internal modules ──────────────────────────────────────────────────────────
from analysis_service import (
    AnalysisV2Result,
    compute_speech_metrics,
    is_model_available,
    run_full_analysis,
)
from adaptive import (
    Question,
    SelectionResult,
    SessionState,
    TopicPerformance,
    get_question_by_id,
    load_question_bank,
    select_next_question,
    update_performance,
)
from speech_analyzer import analyze_speech_from_text
from scoring_engine import compute_master_score

# Vision analysis: graceful import (requires opencv)
try:
    from vision_analyzer import analyze_video as _analyze_video
    _vision_available = True
except ImportError:
    _vision_available = False
    logger.warning("vision_analyzer unavailable — video analysis disabled.")

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# App setup
# ──────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="InterVue AI API",
    description=(
        "NLP/ML interview answer analysis. "
        "Uses sentence-transformers for semantic scoring when available; "
        "falls back to rule-based scoring otherwise."
    ),
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Warm up model at startup (non-blocking — logged to console)
@app.on_event("startup")
async def startup_event():
    logger.info("Starting InterVue AI API v3.0...")
    # Trigger model load attempt in background thread-friendly way
    _ = is_model_available()
    bank = load_question_bank()
    logger.info("Question bank ready: %d questions.", len(bank))


# ──────────────────────────────────────────────────────────────────────────────
# ── PRESERVED: Original rule-based schemas & analysis (v1/v2 compat) ──────────
# ──────────────────────────────────────────────────────────────────────────────

STOP_WORDS: set[str] = {
    "the","a","an","is","are","was","were","to","of","and","or","in","on","for",
    "with","i","my","me","it","this","that","how","what","you","your","do","did",
    "about","would","could","should","have","has","be","been","by","but","if",
    "at","as","so","we","they","he","she","can","will","just","not","also",
}
CLARITY_WORDS = [
    "specifically","for example","such as","in other words","that is","meaning",
    "which means","essentially","basically","in particular","clearly","simply","briefly",
]
STRUCTURE_WORDS = {
    "intro":     ["first","initially","to begin","starting","my approach","i started"],
    "reasoning": ["because","therefore","so that","this helped","as a result","since","which allowed"],
    "outcome":   ["result","outcome","finally","improved","learned","achieved","concluded","ended up"],
}
PACING_WORDS = [
    "then","next","after that","subsequently","following","meanwhile","eventually",
    "in the end","to summarise","overall","in conclusion","moving on","additionally",
    "furthermore","however",
]
WEAK_WORDS  = ["maybe","perhaps","i think","i guess","i'm not sure","possibly","kind of","sort of","i believe","not really","not sure"]
STRONG_WORDS= ["i know","i am confident","i demonstrated","i achieved","i led","i built","i implemented","i designed","i solved","successfully","clearly","definitely","i decided","my decision","i chose"]

def _tokenize(text: str) -> list[str]:
    return re.findall(r"\b[\w+#.-]+\b", text.lower())

def _get_keywords(text: str) -> set[str]:
    return {w for w in _tokenize(text) if w not in STOP_WORDS and len(w) > 2}

def _count_phrase_hits(text: str, phrases: list[str]) -> int:
    lower = text.lower()
    return sum(1 for p in phrases if p in lower)

class AnswerRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    answer: str = Field(default="", max_length=10_000)

class CategoryScore(BaseModel):
    label: str
    value: int
    strength: Optional[str] = None
    suggestion: Optional[str] = None

class AnalysisResult(BaseModel):
    word_count: int
    overall_score: int
    categories: list[CategoryScore]
    strengths: list[str]
    suggestions: list[str]
    analysis_type: str

def _run_legacy_analysis(question: str, answer: str) -> dict:
    words = _tokenize(answer)
    wc = len(words)

    def sc_clarity(ans, wc):
        if wc == 0: return 0, None, "Write an answer before submitting."
        hits = _count_phrase_hits(ans, CLARITY_WORDS)
        base = min(hits * 20, 60)
        sents = [s.strip() for s in re.split(r"[.!?]+", ans.strip()) if len(s.strip()) > 5]
        score = max(0, min(100, 40 + base + min(len(sents)*5,30)//2 + (0 if wc>=15 else -20)))
        return score, ("Your answer communicates ideas clearly." if score>=65 else None), (None if score>=65 else "Use phrases like 'for example' to make ideas clearer.")
    def sc_structure(ans):
        lower=ans.lower()
        hits=[any(w in lower for w in STRUCTURE_WORDS[k]) for k in STRUCTURE_WORDS]
        score=round(sum(hits)/len(hits)*100)
        return score,("Your answer has a logical structure." if score>=67 else None),(None if score>=67 else "Organise: situation → action → result.")
    def sc_relevance(q,ans,wc):
        if wc==0: return 0,None,"Answer the question."
        qk,ak=_get_keywords(q),_get_keywords(ans)
        if not qk: return 60,None,None
        ratio=len(qk&ak)/len(qk)
        score=min(100,round(30+ratio*175))
        return score,("Your answer directly addresses the question." if score>=65 else None),(None if score>=65 else "Reference the topic more directly.")
    def sc_confidence(ans,wc):
        if wc==0: return 0,None,"Write an answer."
        score=max(0,min(100,60+_count_phrase_hits(ans,STRONG_WORDS)*12-_count_phrase_hits(ans,WEAK_WORDS)*10))
        return score,("Sounds confident." if score>=65 else None),(None if score>=65 else "Replace 'I think'/'maybe' with direct statements.")
    def sc_pacing(ans,wc):
        if wc==0: return 0,None,"Write an answer."
        score=min(100,round(50+_count_phrase_hits(ans,PACING_WORDS)*15))
        return score,("Good transition words." if score>=70 else None),(None if score>=70 else "Add transitions: 'then', 'next', 'as a result'.")

    cl,cl_s,cl_g = sc_clarity(answer,wc)
    st,st_s,st_g = sc_structure(answer)
    re_,re_s,re_g = sc_relevance(question,answer,wc)
    co,co_s,co_g = sc_confidence(answer,wc)
    pa,pa_s,pa_g = sc_pacing(answer,wc)

    cats=[
        CategoryScore(label="Clarity",value=cl,strength=cl_s,suggestion=cl_g),
        CategoryScore(label="Structure",value=st,strength=st_s,suggestion=st_g),
        CategoryScore(label="Relevance",value=re_,strength=re_s,suggestion=re_g),
        CategoryScore(label="Confidence",value=co,strength=co_s,suggestion=co_g),
        CategoryScore(label="Pacing",value=pa,strength=pa_s,suggestion=pa_g),
    ]
    weights={"Clarity":0.25,"Structure":0.25,"Relevance":0.20,"Confidence":0.15,"Pacing":0.15}
    overall=round(sum(c.value*weights[c.label] for c in cats))
    strengths=[c.strength for c in cats if c.strength] or ["Keep practising — review suggestions below."]
    suggestions=[c.suggestion for c in cats if c.suggestion]
    return {"word_count":wc,"overall_score":overall,"categories":[c.model_dump() for c in cats],"strengths":strengths,"suggestions":suggestions,"analysis_type":"rule_based_v2"}


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic models for V2 endpoints
# ──────────────────────────────────────────────────────────────────────────────

class AnalyzeV2Request(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    answer: str = Field(default="", max_length=15_000)
    question_id: Optional[str] = Field(default=None, description="Question bank ID for enriched metadata")
    expected_concepts: Optional[list[str]] = Field(default=None)
    reference_answer: Optional[str] = Field(default=None, max_length=5000)
    duration_seconds: Optional[float] = Field(default=None, ge=0)


class DimensionScoreOut(BaseModel):
    label: str
    value: int
    weight: float
    method: str
    strength: Optional[str] = None
    suggestion: Optional[str] = None


class SemanticOut(BaseModel):
    available: bool
    similarity: Optional[float] = None
    interpretation: str
    limitation: str


class ConceptDetailOut(BaseModel):
    concept: str
    covered: bool
    method: str
    similarity: float
    excerpt: Optional[str] = None


class AnalysisV2Response(BaseModel):
    word_count: int
    overall_score: int
    overall_score_formula: str
    dimensions: list[DimensionScoreOut]
    semantic: SemanticOut
    concepts_covered: list[str]
    concepts_to_revisit: list[str]
    concept_details: list[ConceptDetailOut]
    strengths: list[str]
    improvement_suggestions: list[str]
    reference_outline: Optional[str] = None
    analysis_type: str
    model_available: bool
    speech_metrics: Optional[dict] = None


class NextQuestionRequest(BaseModel):
    role: str = Field(min_length=1, max_length=100)
    current_difficulty: str = Field(default="Easy")
    answered_question_ids: list[str] = Field(default_factory=list)
    topic_scores: Optional[dict[str, list[float]]] = Field(
        default=None,
        description="topic → list of scores (0–100) from this session"
    )
    last_score: Optional[float] = Field(default=None, ge=0, le=100)
    last_question_id: Optional[str] = Field(default=None)
    prefer_follow_up: bool = Field(default=False)


class QuestionOut(BaseModel):
    id: str
    text: str
    role: str
    topic: str
    subtopic: str
    difficulty: str
    type: str
    expected_concepts: list[str]
    reference_answer: str
    rubric_hints: list[str]
    follow_ups: list[str]
    source: str


class NextQuestionResponse(BaseModel):
    question: Optional[QuestionOut] = None
    reason: str
    difficulty_change: str
    target_topic: Optional[str] = None
    no_more_questions: bool = False


class SpeechMetricsRequest(BaseModel):
    transcript: str = Field(min_length=0, max_length=10_000)
    duration_seconds: Optional[float] = Field(default=None, ge=0)


class SessionScoreRequest(BaseModel):
    """Aggregate topic performance from a completed session."""
    analyses: list[dict] = Field(
        description="List of {topic, overall_score} dicts from completed answers"
    )


class TopicSummaryOut(BaseModel):
    topic: str
    attempts: int
    average_score: float
    recent_average: float
    status: str   # "strong" | "developing" | "needs_practice" | "insufficient_data"


# ──────────────────────────────────────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/")
def home():
    return {
        "message": "InterVue AI API is running",
        "version": "3.0.0",
        "model_available": is_model_available(),
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_available": is_model_available(),
        "model_name": "all-MiniLM-L6-v2" if is_model_available() else None,
        "analysis_mode": "semantic_v2" if is_model_available() else "rule_based_v2_fallback",
    }


# ── Original endpoint preserved ───────────────────────────────────────────────

@app.post("/analyze", response_model=AnalysisResult)
def analyze_legacy(request: AnswerRequest):
    """Original rule-based analysis endpoint. Preserved for backward compatibility."""
    return _run_legacy_analysis(request.question, request.answer)


# ── New V2 endpoint ───────────────────────────────────────────────────────────

@app.post("/analyze/v2", response_model=AnalysisV2Response)
def analyze_v2(request: AnalyzeV2Request):
    """
    Full NLP/ML analysis pipeline.

    If a question_id is provided and exists in the question bank, its
    expected_concepts and reference_answer are used automatically
    (request overrides take priority if also provided).
    """
    expected_concepts = request.expected_concepts
    reference_answer = request.reference_answer

    # Enrich from question bank if id provided
    if request.question_id:
        q = get_question_by_id(request.question_id)
        if q:
            if expected_concepts is None:
                expected_concepts = q.expected_concepts
            if reference_answer is None:
                reference_answer = q.reference_answer

    result: AnalysisV2Result = run_full_analysis(
        question=request.question,
        answer=request.answer,
        expected_concepts=expected_concepts,
        reference_answer=reference_answer,
        duration_seconds=request.duration_seconds,
    )

    return AnalysisV2Response(
        word_count=result.word_count,
        overall_score=result.overall_score,
        overall_score_formula=result.overall_score_formula,
        dimensions=[
            DimensionScoreOut(
                label=d.label, value=d.value, weight=d.weight, method=d.method,
                strength=d.strength, suggestion=d.suggestion,
            )
            for d in result.dimensions
        ],
        semantic=SemanticOut(
            available=result.semantic.available,
            similarity=result.semantic.similarity,
            interpretation=result.semantic.interpretation,
            limitation=result.semantic.limitation,
        ),
        concepts_covered=result.concepts_covered,
        concepts_to_revisit=result.concepts_to_revisit,
        concept_details=[ConceptDetailOut(**c) for c in result.concept_details],
        strengths=result.strengths,
        improvement_suggestions=result.improvement_suggestions,
        reference_outline=result.reference_outline,
        analysis_type=result.analysis_type,
        model_available=result.model_available,
        speech_metrics=result.speech_metrics,
    )


# ── Question bank endpoints ───────────────────────────────────────────────────

@app.get("/questions", response_model=list[QuestionOut])
def list_questions(
    role: Optional[str] = None,
    difficulty: Optional[str] = None,
    topic: Optional[str] = None,
    type: Optional[str] = None,
    limit: int = 50,
):
    """
    List questions from the question bank.
    All filters are optional and case-insensitive.
    """
    bank = load_question_bank()
    filtered = bank

    if role:
        filtered = [q for q in filtered if q.role.lower() == role.lower()]
    if difficulty:
        filtered = [q for q in filtered if q.difficulty.lower() == difficulty.lower()]
    if topic:
        filtered = [q for q in filtered if q.topic.lower() == topic.lower()]
    if type:
        filtered = [q for q in filtered if q.type.lower() == type.lower()]

    return [q.__dict__ for q in filtered[:limit]]


@app.get("/questions/{question_id}", response_model=QuestionOut)
def get_question(question_id: str):
    q = get_question_by_id(question_id)
    if not q:
        raise HTTPException(status_code=404, detail=f"Question '{question_id}' not found.")
    return q.__dict__


# ── Adaptive selection ────────────────────────────────────────────────────────

@app.post("/next-question", response_model=NextQuestionResponse)
def next_question(request: NextQuestionRequest):
    """
    Select the next adaptive question for an in-progress session.
    """
    # Build SessionState from request
    state = SessionState(
        role=request.role,
        difficulty=request.current_difficulty,
        answered_question_ids=request.answered_question_ids,
    )

    # Populate topic performance from session history
    if request.topic_scores:
        for topic, scores in request.topic_scores.items():
            tp = TopicPerformance(
                topic=topic,
                attempts=len(scores),
                total_score=sum(scores),
                recent_scores=scores[-3:],
            )
            state.topic_performance[topic] = tp

    result: SelectionResult = select_next_question(
        state=state,
        last_score=request.last_score,
        last_question_id=request.last_question_id,
        follow_up_preferred=request.prefer_follow_up,
    )

    question_out = None
    if result.question:
        question_out = QuestionOut(**result.question.__dict__)

    return NextQuestionResponse(
        question=question_out,
        reason=result.reason,
        difficulty_change=result.difficulty_change,
        target_topic=result.target_topic,
        no_more_questions=result.no_more_questions,
    )


# ── Speech metrics ────────────────────────────────────────────────────────────

@app.post("/speech-metrics")
def speech_metrics_endpoint(request: SpeechMetricsRequest):
    """
    Compute communication metrics from a voice transcript.
    """
    metrics = compute_speech_metrics(
        transcript=request.transcript,
        duration_seconds=request.duration_seconds,
    )
    return metrics.__dict__


# ── Session skill summary ─────────────────────────────────────────────────────

@app.post("/session/skill-summary", response_model=list[TopicSummaryOut])
def session_skill_summary(request: SessionScoreRequest):
    """
    Aggregate topic-level performance from a list of {topic, overall_score} objects.
    Returns a summary per topic with a plain-English status label.
    """
    topic_map: dict[str, list[float]] = {}
    for item in request.analyses:
        topic = item.get("topic", "General")
        score = float(item.get("overall_score", 50))
        topic_map.setdefault(topic, []).append(score)

    summaries: list[TopicSummaryOut] = []
    for topic, scores in topic_map.items():
        avg = round(sum(scores) / len(scores), 1)
        recent = round(sum(scores[-3:]) / len(scores[-3:]), 1)
        attempts = len(scores)

        if attempts < 2:
            status = "insufficient_data"
        elif avg >= 70:
            status = "strong"
        elif avg >= 50:
            status = "developing"
        else:
            status = "needs_practice"

        summaries.append(TopicSummaryOut(
            topic=topic,
            attempts=attempts,
            average_score=avg,
            recent_average=recent,
            status=status,
        ))

    summaries.sort(key=lambda s: s.average_score)
    return summaries


# ─────────────────────────────────────────────────────────────────────────────
# ── New v4 endpoints: Upload & Full Pipeline ──────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────

import tempfile
import uuid
import dataclasses
from fastapi import UploadFile, File, Form

SUPPORTED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/mpeg"}
SUPPORTED_AUDIO_TYPES = {"audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "audio/mp4", "audio/x-m4a"}
MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB


@app.post("/interview/upload-analyze", tags=["Upload Pipeline"])
async def upload_and_analyze(
    file: UploadFile = File(..., description="Video or audio interview recording"),
    transcript: Optional[str] = Form(None, description="Optional manually-provided transcript"),
    question: Optional[str] = Form(None, description="Optional interview question for NLP relevance scoring"),
    reference_answer: Optional[str] = Form(None, description="Optional reference answer for NLP comparison"),
):
    """
    Full interview analysis pipeline for uploaded recordings.

    1. Save uploaded file to a temporary location
    2. Run speech analysis from transcript (or attempt transcription if blank)
    3. Run video analysis if the file is a video (requires opencv)
    4. Run NLP analysis if question + transcript are provided
    5. Combine via scoring engine
    6. Return structured results
    """
    # Validate file type
    content_type = file.content_type or ""
    is_video = content_type in SUPPORTED_VIDEO_TYPES
    is_audio = content_type in SUPPORTED_AUDIO_TYPES

    if not is_video and not is_audio:
        # Try to infer from filename
        fname = (file.filename or "").lower()
        if any(fname.endswith(ext) for ext in [".mp4", ".webm", ".mov", ".avi"]):
            is_video = True
        elif any(fname.endswith(ext) for ext in [".mp3", ".wav", ".ogg", ".m4a"]):
            is_audio = True
        else:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file type '{content_type}'. Please upload a video or audio file.",
            )

    # Read and size-check
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large ({len(content)} bytes). Max is 200 MB.")

    session_id = str(uuid.uuid4())
    suffix = Path(file.filename or "upload.mp4").suffix or (".mp4" if is_video else ".mp3")

    # Write to temp file
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    speech_result_dict = None
    vision_result_dict = None
    nlp_result_dict = None
    effective_transcript = transcript

    try:
        # ── Step 1: Transcription ──────────────────────────────────────────────
        if not effective_transcript:
            # Attempt faster-whisper transcription
            try:
                from faster_whisper import WhisperModel  # type: ignore
                logger.info("Transcribing with faster-whisper...")
                model = WhisperModel("small", device="cpu", compute_type="int8")
                segments, info = model.transcribe(str(tmp_path), beam_size=5)
                effective_transcript = " ".join(seg.text.strip() for seg in segments)
                logger.info("Transcription complete: %d chars, %.1fs detected", len(effective_transcript), info.duration)
            except ImportError:
                logger.info("faster-whisper not installed — skipping auto-transcription.")
            except Exception as exc:
                logger.warning("Transcription failed: %s", exc)

        # ── Step 2: Speech analysis ────────────────────────────────────────────
        if effective_transcript:
            speech_result = analyze_speech_from_text(effective_transcript)
            speech_result_dict = dataclasses.asdict(speech_result)

        # ── Step 3: Video analysis ─────────────────────────────────────────────
        if is_video and _vision_available:
            logger.info("Running video analysis on %s", tmp_path)
            vision_result = _analyze_video(str(tmp_path))
            vision_result_dict = dataclasses.asdict(vision_result)

        # ── Step 4: NLP analysis ───────────────────────────────────────────────
        if question and effective_transcript:
            try:
                nlp_result = run_full_analysis(question, effective_transcript, reference_answer)
                nlp_result_dict = nlp_result.model_dump()
            except Exception as exc:
                logger.warning("NLP analysis failed: %s", exc)

        # ── Step 5: Master scoring ─────────────────────────────────────────────
        master = compute_master_score(
            nlp_result=nlp_result_dict,
            speech_result=speech_result_dict,
            vision_result=vision_result_dict,
        )

        # ── Build response ─────────────────────────────────────────────────────
        categories_out = []
        for cat in master.categories:
            categories_out.append({
                "label": cat.label,
                "score": cat.score,
                "weight": cat.weight,
                "weighted_score": cat.weighted_score,
                "sub_scores": cat.sub_scores,
                "strengths": cat.strengths,
                "suggestions": cat.suggestions,
                "data_source": cat.data_source,
            })

        return {
            "session_id": session_id,
            "file_name": file.filename,
            "file_type": content_type,
            "has_video": is_video,
            "has_audio": is_video or is_audio,
            "speech": speech_result_dict,
            "vision": vision_result_dict,
            "overall_score": master.overall_score,
            "overall_grade": master.overall_grade,
            "overall_label": master.overall_label,
            "categories": categories_out,
            "top_strength": master.top_strength,
            "top_suggestion": master.top_suggestion,
            "formula": master.formula,
            "data_completeness": master.data_completeness,
            "transcript": effective_transcript,
        }

    finally:
        # Always clean up temp file
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass


# ── Speech-only analysis (text input, no file needed) ─────────────────────────

class SpeechAnalyzeRequest(BaseModel):
    transcript: str = Field(..., min_length=1, description="Answer text to analyse")
    duration_seconds: Optional[float] = Field(None, description="Actual recording duration")

@app.post("/interview/speech-analyze", tags=["Upload Pipeline"])
def speech_analyze(req: SpeechAnalyzeRequest):
    """Analyse speech characteristics from a plain text transcript."""
    import dataclasses
    result = analyze_speech_from_text(req.transcript, req.duration_seconds)
    return dataclasses.asdict(result)
