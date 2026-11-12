"""
InterVue AI — Modular NLP/ML Analysis Service
==============================================

Architecture:
  ModelManager     → loads/caches sentence-transformer model once per process
  ConceptDetector  → semantic concept coverage (falls back to keyword if model absent)
  RubricScorer     → multi-dimensional rubric evaluation
  AnalysisPipeline → orchestrates all scorers, returns AnalysisV2Result

All scores are explained — no black-box magic.
Graceful degradation when the ML model cannot be loaded.
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Model Manager — loads once, caches for the process lifetime
# ──────────────────────────────────────────────────────────────────────────────

MODEL_NAME = "all-MiniLM-L6-v2"          # 90 MB; MIT licence
_model_instance = None
_model_load_attempted = False
_model_available = False


def _try_load_model():
    global _model_instance, _model_load_attempted, _model_available
    if _model_load_attempted:
        return
    _model_load_attempted = True
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
        logger.info("Loading sentence-transformer model '%s'...", MODEL_NAME)
        t0 = time.time()
        _model_instance = SentenceTransformer(MODEL_NAME)
        elapsed = round(time.time() - t0, 2)
        logger.info("Model loaded in %.2fs.", elapsed)
        _model_available = True
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "sentence-transformers not available (%s). "
            "Semantic features disabled; rule-based fallback active.",
            exc,
        )
        _model_available = False


def get_model():
    """Return the loaded model, or None if unavailable."""
    _try_load_model()
    return _model_instance


def is_model_available() -> bool:
    _try_load_model()
    return _model_available


def encode(texts: list[str]) -> Optional[np.ndarray]:
    """Encode a list of strings to embeddings. Returns None if model unavailable."""
    model = get_model()
    if model is None:
        return None
    try:
        return model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
    except Exception as exc:  # noqa: BLE001
        logger.error("Encoding failed: %s", exc)
        return None


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two 1-D vectors."""
    from numpy.linalg import norm  # type: ignore
    n_a, n_b = norm(a), norm(b)
    if n_a == 0 or n_b == 0:
        return 0.0
    return float(np.dot(a, b) / (n_a * n_b))


# ──────────────────────────────────────────────────────────────────────────────
# Text helpers
# ──────────────────────────────────────────────────────────────────────────────

STOP_WORDS: set[str] = {
    "the", "a", "an", "is", "are", "was", "were", "to", "of",
    "and", "or", "in", "on", "for", "with", "i", "my", "me",
    "it", "this", "that", "how", "what", "you", "your", "do",
    "did", "about", "would", "could", "should", "have", "has",
    "be", "been", "by", "but", "if", "at", "as", "so", "we",
    "they", "he", "she", "can", "will", "just", "not", "also",
}

CLARITY_PHRASES = [
    "specifically", "for example", "such as", "in other words", "that is",
    "meaning", "which means", "essentially", "basically", "in particular",
    "clearly", "simply", "briefly", "to clarify", "to illustrate",
]

STRUCTURE_WORDS = {
    "intro":     ["first", "initially", "to begin", "starting", "my approach", "i started", "firstly"],
    "reasoning": ["because", "therefore", "so that", "this helped", "as a result", "since", "which allowed", "thus", "hence"],
    "outcome":   ["result", "outcome", "finally", "improved", "learned", "achieved", "concluded", "ended up", "in the end", "ultimately"],
}

PACING_PHRASES = [
    "then", "next", "after that", "subsequently", "following", "meanwhile",
    "eventually", "in the end", "to summarise", "overall", "in conclusion",
    "moving on", "additionally", "furthermore", "however", "moreover",
]

WEAK_PHRASES = [
    "maybe", "perhaps", "i think", "i guess", "i'm not sure", "possibly",
    "kind of", "sort of", "i believe", "not really", "not sure", "i suppose",
]

STRONG_PHRASES = [
    "i know", "i am confident", "i demonstrated", "i achieved", "i led",
    "i built", "i implemented", "i designed", "i solved", "successfully",
    "clearly", "definitely", "i decided", "my decision", "i chose", "i proved",
]

FILLER_WORDS = ["um", "uh", "like", "basically", "literally", "you know", "right", "okay so"]


def tokenize(text: str) -> list[str]:
    return re.findall(r"\b[\w+#.-]+\b", text.lower())


def keyword_set(text: str) -> set[str]:
    return {w for w in tokenize(text) if w not in STOP_WORDS and len(w) > 2}


def count_phrase_hits(text: str, phrases: list[str]) -> int:
    lower = text.lower()
    return sum(1 for p in phrases if p in lower)


def sentence_count(text: str) -> int:
    parts = re.split(r"[.!?]+", text.strip())
    return len([s for s in parts if len(s.strip()) > 5])


def word_count(text: str) -> int:
    return len(tokenize(text))


# ──────────────────────────────────────────────────────────────────────────────
# Concept Coverage Detector
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class ConceptResult:
    concept: str
    covered: bool
    method: str          # "semantic" | "keyword" | "unavailable"
    similarity: float    # 0–1 when semantic; keyword overlap ratio otherwise
    excerpt: str | None  # relevant snippet from answer, when available


def detect_concepts(
    answer: str,
    expected_concepts: list[str],
    semantic_threshold: float = 0.40,
) -> list[ConceptResult]:
    """
    For each expected concept, determine whether the answer appears to cover it.

    Strategy:
      1. If model is available → compare answer sentences with the concept
         phrase using cosine similarity. Mark covered if any sentence exceeds
         threshold.
      2. Fallback → keyword substring / token overlap check.

    Returns one ConceptResult per concept.
    """
    if not expected_concepts:
        return []

    answer_lower = answer.lower()
    answer_words = keyword_set(answer)
    results: list[ConceptResult] = []

    if is_model_available() and answer.strip():
        # Split answer into sentences for fine-grained matching
        sentences = [s.strip() for s in re.split(r"[.!?\n]+", answer) if len(s.strip()) > 8]
        if not sentences:
            sentences = [answer]

        # Encode answer sentences + concept phrases in one batch for efficiency
        all_texts = sentences + expected_concepts
        all_embeddings = encode(all_texts)

        if all_embeddings is not None:
            sent_embeddings = all_embeddings[: len(sentences)]
            concept_embeddings = all_embeddings[len(sentences) :]

            for idx, concept in enumerate(expected_concepts):
                concept_emb = concept_embeddings[idx]
                sims = [cosine_similarity(se, concept_emb) for se in sent_embeddings]
                best_sim = max(sims) if sims else 0.0
                best_sent_idx = sims.index(best_sim) if sims else 0
                covered = best_sim >= semantic_threshold

                # Extract a short excerpt from the best matching sentence
                best_sentence = sentences[best_sent_idx] if sentences else ""
                excerpt = best_sentence[:120] if covered and best_sentence else None

                results.append(ConceptResult(
                    concept=concept,
                    covered=covered,
                    method="semantic",
                    similarity=round(best_sim, 3),
                    excerpt=excerpt,
                ))
            return results

    # Fallback: keyword / substring detection
    for concept in expected_concepts:
        concept_words = keyword_set(concept)
        # Direct substring match
        direct_match = concept.lower() in answer_lower
        # Keyword overlap
        if concept_words:
            overlap = len(concept_words & answer_words) / len(concept_words)
        else:
            overlap = 1.0 if direct_match else 0.0

        covered = direct_match or overlap >= 0.5
        results.append(ConceptResult(
            concept=concept,
            covered=covered,
            method="keyword",
            similarity=round(overlap, 3),
            excerpt=None,
        ))

    return results


# ──────────────────────────────────────────────────────────────────────────────
# Rubric Dimensions
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class DimensionScore:
    label: str
    value: int               # 0–100
    weight: float
    method: str              # how the score was calculated
    strength: str | None = None
    suggestion: str | None = None


def _score_relevance(question: str, answer: str, wc: int) -> DimensionScore:
    """
    Relevance: how directly does the answer address this specific question?
    Primary: semantic similarity between question and answer (if model available).
    Fallback: keyword overlap.
    """
    if wc == 0:
        return DimensionScore("Relevance", 0, 0.22, "empty",
                              suggestion="Write an answer before submitting.")

    if is_model_available():
        embeddings = encode([question, answer])
        if embeddings is not None:
            sim = cosine_similarity(embeddings[0], embeddings[1])
            # Scale: sim of 0.9 → 100, 0.3 → 40, <0.1 → 20
            score = int(min(100, max(20, round((sim - 0.1) / 0.8 * 80 + 20))))
            method = "semantic"
            strength = "Your answer directly addresses this question." if score >= 65 else None
            suggestion = (None if score >= 65
                          else "Focus your answer more directly on what this question asks.")
            return DimensionScore("Relevance", score, 0.22, method, strength, suggestion)

    # Keyword fallback
    q_kw = keyword_set(question)
    a_kw = keyword_set(answer)
    overlap = len(q_kw & a_kw) / len(q_kw) if q_kw else 0.5
    score = int(min(100, round(30 + overlap * 175)))
    strength = "Your answer addresses the question's key concepts." if score >= 65 else None
    suggestion = (None if score >= 65
                  else "Make sure your answer references the topic asked about.")
    return DimensionScore("Relevance", score, 0.22, "keyword_overlap", strength, suggestion)


def _score_technical_coverage(
    answer: str, wc: int, concept_results: list[ConceptResult]
) -> DimensionScore:
    """
    Technical / Conceptual Coverage: what fraction of expected concepts were addressed?
    Only meaningful when expected_concepts is non-empty.
    """
    if not concept_results:
        # No rubric → neutral score based on length
        base = min(60, max(20, wc * 2)) if wc < 30 else 60
        return DimensionScore("Coverage", base, 0.22, "length_proxy",
                              suggestion="No reference concepts available for this question type.")

    covered_count = sum(1 for c in concept_results if c.covered)
    ratio = covered_count / len(concept_results)
    score = int(round(ratio * 100))

    method = concept_results[0].method if concept_results else "unavailable"
    strength = (
        f"You covered {covered_count}/{len(concept_results)} key concepts."
        if score >= 60 else None
    )
    suggestion = (
        None if score >= 60
        else f"Consider addressing: {', '.join(c.concept for c in concept_results if not c.covered)[:120]}."
    )
    return DimensionScore("Coverage", score, 0.22, method, strength, suggestion)


def _score_explanation_quality(answer: str, wc: int) -> DimensionScore:
    """
    Explanation Quality: clarity and use of examples/connectives.
    """
    if wc == 0:
        return DimensionScore("Explanation", 0, 0.18, "empty",
                              suggestion="Write an answer to score explanation quality.")

    clarity_hits = count_phrase_hits(answer, CLARITY_PHRASES)
    sent_count = sentence_count(answer)
    base = min(60, clarity_hits * 20)
    sent_bonus = min(25, sent_count * 5)
    length_penalty = -15 if wc < 15 else 0
    score = int(max(0, min(100, 35 + base + sent_bonus + length_penalty)))

    strength = "Your explanation is clear and uses helpful examples or connectives." if score >= 65 else None
    suggestion = (None if score >= 65
                  else "Add phrases like 'for example', 'specifically', or 'this means' to clarify your points.")
    return DimensionScore("Explanation", score, 0.18, "heuristic_phrase_count", strength, suggestion)


def _score_structure(answer: str) -> DimensionScore:
    """
    Structure: intro → reasoning → outcome flow.
    """
    lower = answer.lower()
    hits = [
        any(w in lower for w in STRUCTURE_WORDS["intro"]),
        any(w in lower for w in STRUCTURE_WORDS["reasoning"]),
        any(w in lower for w in STRUCTURE_WORDS["outcome"]),
    ]
    score = int(round(sum(hits) / len(hits) * 100))
    strength = "Your answer has a logical introduction → reasoning → outcome structure." if score >= 67 else None
    suggestion = (None if score >= 67
                  else "Organise your answer: what the situation was, what you did, and what the result was.")
    return DimensionScore("Structure", score, 0.20, "heuristic_structure_keywords", strength, suggestion)


def _score_confidence(answer: str, wc: int) -> DimensionScore:
    """
    Communication / Confidence: assertive vs hedging language.
    """
    if wc == 0:
        return DimensionScore("Confidence", 0, 0.12, "empty",
                              suggestion="Write an answer to score communication confidence.")
    strong_hits = count_phrase_hits(answer, STRONG_PHRASES)
    weak_hits = count_phrase_hits(answer, WEAK_PHRASES)
    score = int(max(0, min(100, 60 + strong_hits * 12 - weak_hits * 10)))
    strength = "Your answer sounds assertive and confident." if score >= 65 else None
    suggestion = (None if score >= 65
                  else "Replace hedging phrases like 'I think' or 'maybe' with direct statements of what you know.")
    return DimensionScore("Confidence", score, 0.12, "heuristic_phrase_count", strength, suggestion)


def _score_pacing(answer: str, wc: int) -> DimensionScore:
    """
    Pacing: use of transition words that guide the listener.
    """
    if wc == 0:
        return DimensionScore("Pacing", 0, 0.06, "empty",
                              suggestion="Write an answer to score pacing.")
    hits = count_phrase_hits(answer, PACING_PHRASES)
    score = int(min(100, 50 + hits * 15))
    strength = "Your answer uses good transition words that make it easy to follow." if score >= 70 else None
    suggestion = (None if score >= 70
                  else "Add transitions like 'then', 'next', 'as a result' to guide the listener.")
    return DimensionScore("Pacing", score, 0.06, "heuristic_phrase_count", strength, suggestion)


# ──────────────────────────────────────────────────────────────────────────────
# Semantic Similarity (standalone — compared to reference answer)
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class SemanticResult:
    available: bool
    similarity: float | None       # cosine similarity 0–1
    interpretation: str            # plain English explanation
    limitation: str                # honest caveat


def compute_semantic_similarity(answer: str, reference: str) -> SemanticResult:
    """
    Compare the candidate's answer with the reference answer using cosine
    similarity on sentence embeddings.

    Important: similarity to one curated reference is NOT a definitive measure
    of correctness. Correct answers can be phrased very differently.
    """
    if not is_model_available():
        return SemanticResult(
            available=False,
            similarity=None,
            interpretation="Semantic comparison unavailable (model not loaded).",
            limitation="Install sentence-transformers and restart the server to enable this feature.",
        )

    if not answer.strip():
        return SemanticResult(
            available=True,
            similarity=0.0,
            interpretation="No answer was submitted.",
            limitation="Submit an answer to see semantic similarity.",
        )

    if not reference.strip():
        return SemanticResult(
            available=False,
            similarity=None,
            interpretation="No reference answer available for this question.",
            limitation="Semantic comparison requires a curated reference answer.",
        )

    embeddings = encode([answer, reference])
    if embeddings is None:
        return SemanticResult(
            available=False,
            similarity=None,
            interpretation="Encoding failed unexpectedly.",
            limitation="Check server logs for details.",
        )

    sim = round(cosine_similarity(embeddings[0], embeddings[1]), 3)

    if sim >= 0.80:
        interpretation = "Your answer is semantically very close to the reference answer."
    elif sim >= 0.60:
        interpretation = "Your answer covers many of the same ideas as the reference answer."
    elif sim >= 0.40:
        interpretation = "Your answer partially overlaps with the reference answer in meaning."
    else:
        interpretation = "Your answer differs significantly in phrasing or content from the reference."

    return SemanticResult(
        available=True,
        similarity=sim,
        interpretation=interpretation,
        limitation=(
            "Similarity to one curated reference is not a definitive measure of correctness. "
            "Correct answers can be phrased in many ways."
        ),
    )


# ──────────────────────────────────────────────────────────────────────────────
# Speech / Communication Metrics (from transcript text)
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class SpeechMetrics:
    word_count: int
    filler_count: int
    filler_words_found: list[str]
    estimated_wpm: float | None    # None when duration is unavailable
    is_very_short: bool
    is_very_long: bool
    notes: list[str]


def compute_speech_metrics(transcript: str, duration_seconds: float | None = None) -> SpeechMetrics:
    """
    Calculate communication metrics from a transcribed answer.
    duration_seconds: if provided (from audio recording), enables WPM calculation.

    Limitations: WPM from transcripts may vary; filler detection is language-specific;
    silence / pause duration is not measurable from text alone.
    """
    wc = word_count(transcript)
    lower = transcript.lower()

    filler_hits = [fw for fw in FILLER_WORDS if fw in lower]
    filler_count = sum(lower.count(fw) for fw in FILLER_WORDS)

    wpm: float | None = None
    if duration_seconds and duration_seconds > 0:
        wpm = round((wc / duration_seconds) * 60, 1)

    notes: list[str] = []
    if wc < 20:
        notes.append("Answer is very short. Consider expanding your response.")
    elif wc > 350:
        notes.append("Answer is very long. In a real interview, aim for concise, structured responses.")

    if filler_count > 3:
        notes.append(f"Filler words detected ({filler_count}×): try to reduce '{', '.join(set(filler_hits))}'.")

    if wpm is not None:
        if wpm < 90:
            notes.append(f"Speaking pace is slow ({wpm} WPM). Aim for 120–160 WPM for interview answers.")
        elif wpm > 180:
            notes.append(f"Speaking pace is fast ({wpm} WPM). Slow down slightly for clarity.")
        else:
            notes.append(f"Speaking pace is good ({wpm} WPM).")

    return SpeechMetrics(
        word_count=wc,
        filler_count=filler_count,
        filler_words_found=list(set(filler_hits)),
        estimated_wpm=wpm,
        is_very_short=wc < 20,
        is_very_long=wc > 350,
        notes=notes,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Full Analysis Pipeline
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class AnalysisV2Result:
    """
    Complete analysis result for one question+answer pair.
    All scores are 0–100. Weights sum to 1.0.
    """
    word_count: int
    overall_score: int                          # weighted average of rubric dimensions
    overall_score_formula: str                  # human-readable formula explanation

    # Rubric dimensions
    dimensions: list[DimensionScore]

    # Semantic similarity to reference answer
    semantic: SemanticResult

    # Concept coverage
    concepts_covered: list[str]
    concepts_to_revisit: list[str]
    concept_details: list[dict]                 # full ConceptResult dicts

    # Aggregated feedback
    strengths: list[str]
    improvement_suggestions: list[str]
    reference_outline: str | None               # from question bank

    # Metadata
    analysis_type: str                          # "semantic_v2" | "rule_based_v2_fallback"
    model_available: bool
    speech_metrics: dict | None = None          # from compute_speech_metrics if voice answer


def run_full_analysis(
    question: str,
    answer: str,
    expected_concepts: list[str] | None = None,
    reference_answer: str | None = None,
    duration_seconds: float | None = None,
) -> AnalysisV2Result:
    """
    Run the full NLP/ML analysis pipeline for a single Q&A pair.

    Parameters
    ----------
    question           : the interview question text
    answer             : the candidate's answer (text or transcript)
    expected_concepts  : list of key concepts from the question bank
    reference_answer   : curated reference answer (for semantic comparison)
    duration_seconds   : recording duration (for WPM calculation; optional)
    """
    answer = (answer or "").strip()
    wc = word_count(answer)

    # 1. Concept detection
    concept_results = detect_concepts(answer, expected_concepts or [])

    # 2. Rubric dimensions
    rel = _score_relevance(question, answer, wc)
    cov = _score_technical_coverage(answer, wc, concept_results)
    exp = _score_explanation_quality(answer, wc)
    struct = _score_structure(answer)
    conf = _score_confidence(answer, wc)
    pac = _score_pacing(answer, wc)

    dimensions = [rel, cov, exp, struct, conf, pac]

    # 3. Weighted overall score
    total_weight = sum(d.weight for d in dimensions)
    overall = round(sum(d.value * d.weight for d in dimensions) / total_weight)

    weight_parts = " + ".join(
        f"{d.label}({d.value}×{d.weight})" for d in dimensions
    )
    formula = f"weighted_avg({weight_parts}) / {round(total_weight, 2)} = {overall}"

    # 4. Semantic similarity
    semantic = compute_semantic_similarity(answer, reference_answer or "")

    # 5. Concept lists
    covered = [c.concept for c in concept_results if c.covered]
    to_revisit = [c.concept for c in concept_results if not c.covered]
    concept_dicts = [
        {
            "concept": c.concept,
            "covered": c.covered,
            "method": c.method,
            "similarity": c.similarity,
            "excerpt": c.excerpt,
        }
        for c in concept_results
    ]

    # 6. Aggregate strengths & suggestions
    strengths = [d.strength for d in dimensions if d.strength]
    suggestions = [d.suggestion for d in dimensions if d.suggestion]

    if not strengths:
        if wc > 0:
            strengths = ["You have started practising — review the suggestions below to improve."]
        else:
            strengths = []

    if not suggestions and wc == 0:
        suggestions = ["Write an answer and submit it to receive personalised feedback."]

    # 7. Speech metrics (only when answer was transcribed from voice)
    sm: SpeechMetrics | None = None
    if duration_seconds is not None or any(fw in answer.lower() for fw in FILLER_WORDS[:4]):
        sm = compute_speech_metrics(answer, duration_seconds)

    analysis_type = "semantic_v2" if is_model_available() else "rule_based_v2_fallback"

    return AnalysisV2Result(
        word_count=wc,
        overall_score=overall,
        overall_score_formula=formula,
        dimensions=dimensions,
        semantic=semantic,
        concepts_covered=covered,
        concepts_to_revisit=to_revisit,
        concept_details=concept_dicts,
        strengths=strengths,
        improvement_suggestions=suggestions,
        reference_outline=reference_answer,
        analysis_type=analysis_type,
        model_available=is_model_available(),
        speech_metrics=sm.__dict__ if sm else None,
    )
