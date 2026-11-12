"""
InterVue AI — Master Scoring Engine
=====================================

Combines outputs from all analysis modules into a unified,
category-wise and overall performance score.

Scoring Architecture
--------------------
Four primary categories, each 0–100:

  1. Speech Score         (weight 0.30)
     Sources: WPM, filler words, answer length, TTR, repetition

  2. NLP / Content Score  (weight 0.35)
     Sources: semantic relevance, concept coverage, rubric dimensions
     (from analysis_service.py)

  3. Communication Score  (weight 0.20)
     Sources: explanation quality, structure, confidence, pacing
     (from rubric dimensions in analysis_service.py)

  4. Non-Verbal Score     (weight 0.15)
     Sources: eye contact, head movement, posture, lighting
     (from vision_analyzer.py)
     → Defaults to 60/100 (neutral) when no video is available

Design Principle: Explainability
---------------------------------
Every score is computed from documented, inspectable formulas.
No black-box model produces the final score.
Weights are calibrated to reflect interviewer priorities:
  content > speech > communication > non-verbal

Reference: Mehrabian (1967) 7-38-55 rule is intentionally NOT used
here as it applies to attitude communication, not interview performance.
The weights below are based on HR industry surveys and career coaching
literature.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


# ── Category weights ──────────────────────────────────────────────────────────

CATEGORY_WEIGHTS = {
    "nlp_content":    0.35,   # What you said (relevance + concept coverage)
    "speech":         0.30,   # How you said it (pace, fillers, vocabulary)
    "communication":  0.20,   # Clarity, structure, confidence, pacing
    "non_verbal":     0.15,   # Eye contact, posture, head movement
}


# ── Data types ────────────────────────────────────────────────────────────────

@dataclass
class CategoryResult:
    label: str
    score: int            # 0–100
    weight: float
    weighted_score: float
    sub_scores: dict      # component → value for transparency
    strengths: list[str]
    suggestions: list[str]
    data_source: str      # which module produced this


@dataclass
class ScoringResult:
    # Final scores
    overall_score: int
    overall_grade: str         # "A" | "B" | "C" | "D" | "F"
    overall_label: str         # "Excellent" | "Good" | "Average" | "Needs Work" | "Poor"

    # Category breakdown
    categories: list[CategoryResult]

    # Cross-category insights
    top_strength: str
    top_suggestion: str

    # Formula transparency
    formula: str
    weighting_rationale: str

    # Confidence metadata
    has_video_analysis: bool
    has_audio_analysis: bool
    has_nlp_analysis: bool
    data_completeness: str     # "full" | "partial" | "text_only"


# ── Scoring helpers ───────────────────────────────────────────────────────────

def _grade(score: int) -> tuple[str, str]:
    if score >= 85: return "A", "Excellent"
    if score >= 70: return "B", "Good"
    if score >= 55: return "C", "Average"
    if score >= 40: return "D", "Needs Work"
    return "F", "Poor"


def _extract_nlp_category(nlp_result: Optional[dict]) -> CategoryResult:
    """
    Build NLP/Content category from an AnalysisV2 result dict.
    """
    if not nlp_result:
        return CategoryResult(
            label="Content & Relevance",
            score=50, weight=CATEGORY_WEIGHTS["nlp_content"],
            weighted_score=50 * CATEGORY_WEIGHTS["nlp_content"],
            sub_scores={"note": "No NLP analysis available"},
            strengths=[], suggestions=["Run answer analysis to get NLP scores."],
            data_source="unavailable",
        )

    dimensions = {d["label"]: d["value"] for d in (nlp_result.get("dimensions") or [])}
    relevance = dimensions.get("Relevance", 50)
    coverage = dimensions.get("Coverage", 50)
    explanation = dimensions.get("Explanation", 50)

    # Weighted NLP score: relevance + coverage dominate
    nlp_score = round(relevance * 0.45 + coverage * 0.40 + explanation * 0.15)

    semantic = nlp_result.get("semantic", {})
    semantic_sim = semantic.get("similarity")
    if semantic_sim is not None:
        # Blend semantic similarity as a modifier (±10 points)
        blend = (semantic_sim - 0.5) * 20   # -10 to +10
        nlp_score = max(0, min(100, round(nlp_score + blend)))

    strengths = []
    suggestions = []
    if relevance >= 70:
        strengths.append("Answer is highly relevant to the question asked.")
    else:
        suggestions.append("Focus your answer more directly on the specific question.")
    if coverage >= 70:
        strengths.append(f"Good concept coverage ({len(nlp_result.get('concepts_covered', []))} key concepts).")
    else:
        missed = nlp_result.get("concepts_to_revisit", [])[:3]
        if missed:
            suggestions.append(f"Cover these concepts: {', '.join(missed)}.")

    return CategoryResult(
        label="Content & Relevance",
        score=nlp_score,
        weight=CATEGORY_WEIGHTS["nlp_content"],
        weighted_score=round(nlp_score * CATEGORY_WEIGHTS["nlp_content"], 2),
        sub_scores={"relevance": relevance, "coverage": coverage, "explanation": explanation,
                    "semantic_similarity": semantic_sim},
        strengths=strengths,
        suggestions=suggestions,
        data_source="analysis_service_v2",
    )


def _extract_communication_category(nlp_result: Optional[dict]) -> CategoryResult:
    """
    Build Communication category from rubric dimensions (structure, confidence, pacing).
    """
    if not nlp_result:
        return CategoryResult(
            label="Communication",
            score=50, weight=CATEGORY_WEIGHTS["communication"],
            weighted_score=50 * CATEGORY_WEIGHTS["communication"],
            sub_scores={"note": "No NLP analysis available"},
            strengths=[], suggestions=["Run answer analysis to get communication scores."],
            data_source="unavailable",
        )

    dimensions = {d["label"]: d["value"] for d in (nlp_result.get("dimensions") or [])}
    structure = dimensions.get("Structure", 50)
    confidence = dimensions.get("Confidence", 50)
    pacing = dimensions.get("Pacing", 50)

    comm_score = round(structure * 0.45 + confidence * 0.35 + pacing * 0.20)

    strengths = []
    suggestions = []
    if structure >= 65:
        strengths.append("Answer has a clear structure (situation → action → result).")
    else:
        suggestions.append("Use STAR method: Situation → Task → Action → Result.")
    if confidence >= 65:
        strengths.append("Confident and assertive delivery.")
    else:
        suggestions.append("Replace hedging phrases ('I think', 'maybe') with direct statements.")

    return CategoryResult(
        label="Communication",
        score=comm_score,
        weight=CATEGORY_WEIGHTS["communication"],
        weighted_score=round(comm_score * CATEGORY_WEIGHTS["communication"], 2),
        sub_scores={"structure": structure, "confidence": confidence, "pacing": pacing},
        strengths=strengths,
        suggestions=suggestions,
        data_source="analysis_service_v2_rubric",
    )


def _extract_speech_category(speech_result: Optional[dict]) -> CategoryResult:
    """
    Build Speech category from speech_analyzer result dict.
    """
    if not speech_result:
        return CategoryResult(
            label="Speech & Delivery",
            score=50, weight=CATEGORY_WEIGHTS["speech"],
            weighted_score=50 * CATEGORY_WEIGHTS["speech"],
            sub_scores={"note": "No speech analysis available"},
            strengths=[], suggestions=["Submit an answer to get speech analysis."],
            data_source="unavailable",
        )

    score = speech_result.get("speech_score", 50)
    return CategoryResult(
        label="Speech & Delivery",
        score=score,
        weight=CATEGORY_WEIGHTS["speech"],
        weighted_score=round(score * CATEGORY_WEIGHTS["speech"], 2),
        sub_scores={
            "wpm": speech_result.get("wpm", 0),
            "wpm_score": speech_result.get("wpm_score", 0),
            "filler_score": speech_result.get("filler_score", 0),
            "filler_count": speech_result.get("total_filler_count", 0),
            "length_score": speech_result.get("answer_length_score", 0),
            "ttr": speech_result.get("type_token_ratio", 0),
            "repetition_score": speech_result.get("repetition_score", 0),
        },
        strengths=speech_result.get("strengths", []),
        suggestions=speech_result.get("suggestions", []),
        data_source="speech_analyzer",
    )


def _extract_nonverbal_category(vision_result: Optional[dict]) -> CategoryResult:
    """
    Build Non-Verbal category from vision_analyzer result dict.
    When no video is available, use a neutral 60/100 with clear annotation.
    """
    if not vision_result or vision_result.get("analysis_method") == "unavailable":
        return CategoryResult(
            label="Non-Verbal Behaviour",
            score=60, weight=CATEGORY_WEIGHTS["non_verbal"],
            weighted_score=round(60 * CATEGORY_WEIGHTS["non_verbal"], 2),
            sub_scores={"note": "No video analysis — neutral score assigned"},
            strengths=[],
            suggestions=["Upload a video recording to enable non-verbal behaviour analysis."],
            data_source="unavailable",
        )

    score = vision_result.get("non_verbal_score", 60)
    return CategoryResult(
        label="Non-Verbal Behaviour",
        score=score,
        weight=CATEGORY_WEIGHTS["non_verbal"],
        weighted_score=round(score * CATEGORY_WEIGHTS["non_verbal"], 2),
        sub_scores={
            "eye_contact_pct": vision_result.get("eye_contact_pct", 0),
            "eye_contact_score": vision_result.get("eye_contact_score", 0),
            "head_movement": vision_result.get("head_movement_label", "unknown"),
            "head_movement_score": vision_result.get("head_movement_score", 0),
            "posture_score": vision_result.get("posture_score", 0),
            "lighting_quality": vision_result.get("lighting_quality", "unknown"),
        },
        strengths=vision_result.get("strengths", []),
        suggestions=vision_result.get("suggestions", []),
        data_source=f"vision_analyzer_{vision_result.get('analysis_method', 'unknown')}",
    )


# ── Master scoring function ───────────────────────────────────────────────────

def compute_master_score(
    nlp_result: Optional[dict] = None,
    speech_result: Optional[dict] = None,
    vision_result: Optional[dict] = None,
) -> ScoringResult:
    """
    Compute the unified InterVue AI performance score.
    Dynamically balances category weights based on which modalities (video, speech, NLP)
    are actually present, preventing missing inputs from flattening the final score to a generic default.
    """
    has_video = vision_result is not None and vision_result.get("analysis_method") != "unavailable"
    has_speech = speech_result is not None and speech_result.get("source") != "unavailable"
    has_nlp = nlp_result is not None and nlp_result.get("analysis_type") != "unavailable"

    if has_video and not has_nlp and not has_speech:
        # Video-only analysis: dynamically structure categories around non-verbal presence
        vr = vision_result or {}
        ec_score = int(vr.get("eye_contact_score", 60))
        hm_score = int(vr.get("head_movement_score", 60))
        fv_score = int(vr.get("face_visibility_score", 60))
        env_score = round(int(vr.get("posture_score", 60)) * 0.5 + int(vr.get("lighting_score", 60)) * 0.5)

        categories = [
            CategoryResult(
                label="Eye Contact & Engagement",
                score=ec_score,
                weight=0.35,
                weighted_score=round(ec_score * 0.35, 2),
                sub_scores={
                    "eye_contact_pct": vr.get("eye_contact_pct", 0),
                    "method": vr.get("eye_contact_method", "video_proxy"),
                },
                strengths=[s for s in vr.get("strengths", []) if "eye contact" in s.lower() or "gaze" in s.lower()],
                suggestions=[s for s in vr.get("suggestions", []) if "eye contact" in s.lower() or "camera" in s.lower()],
                data_source="vision_eye_tracker",
            ),
            CategoryResult(
                label="Body Language & Stability",
                score=hm_score,
                weight=0.25,
                weighted_score=round(hm_score * 0.25, 2),
                sub_scores={
                    "head_movement": vr.get("head_movement_label", "unknown"),
                    "motion_variance": vr.get("head_movement_std", 0.0),
                },
                strengths=[s for s in vr.get("strengths", []) if "head" in s.lower() or "stable" in s.lower()],
                suggestions=[s for s in vr.get("suggestions", []) if "head" in s.lower() or "movement" in s.lower()],
                data_source="vision_motion_tracker",
            ),
            CategoryResult(
                label="Framing & Face Visibility",
                score=fv_score,
                weight=0.20,
                weighted_score=round(fv_score * 0.20, 2),
                sub_scores={
                    "face_visibility_pct": vr.get("face_visibility_pct", 0),
                    "frames_analysed": vr.get("frames_analysed", 0),
                },
                strengths=[s for s in vr.get("strengths", []) if "visible" in s.lower() or "face" in s.lower()],
                suggestions=[s for s in vr.get("suggestions", []) if "visible" in s.lower() or "face" in s.lower()],
                data_source="vision_framing_detector",
            ),
            CategoryResult(
                label="Posture & Lighting Quality",
                score=env_score,
                weight=0.20,
                weighted_score=round(env_score * 0.20, 2),
                sub_scores={
                    "posture_label": vr.get("posture_label", "unknown"),
                    "lighting_quality": vr.get("lighting_quality", "unknown"),
                    "avg_brightness": vr.get("avg_brightness", 0),
                },
                strengths=[s for s in vr.get("strengths", []) if "posture" in s.lower() or "lighting" in s.lower()],
                suggestions=[s for s in vr.get("suggestions", []) if "posture" in s.lower() or "lighting" in s.lower()],
                data_source="vision_environment_analyzer",
            ),
        ]
        completeness = "video_visual"
        weighting_rationale = (
            "Video Presence Evaluation: Eye Contact(0.35) > Body Language(0.25) > Framing(0.20) > Posture & Lighting(0.20). "
            "Scores directly reflect measured visual delivery from your video recording."
        )
    else:
        # Multi-modal evaluation (full or partial with speech/NLP)
        raw_cats = [
            _extract_nlp_category(nlp_result),
            _extract_speech_category(speech_result),
            _extract_communication_category(nlp_result),
            _extract_nonverbal_category(vision_result),
        ]
        # Re-weight available categories so missing inputs don't drag score down to 50
        available_cats = [c for c in raw_cats if c.data_source != "unavailable"]
        if not available_cats:
            available_cats = raw_cats

        total_avail_weight = sum(c.weight for c in available_cats)
        categories = []
        for c in raw_cats:
            if c.data_source != "unavailable":
                norm_weight = round(c.weight / total_avail_weight, 3)
                norm_weighted = round(c.score * norm_weight, 2)
                categories.append(CategoryResult(
                    label=c.label, score=c.score, weight=norm_weight, weighted_score=norm_weighted,
                    sub_scores=c.sub_scores, strengths=c.strengths, suggestions=c.suggestions,
                    data_source=c.data_source,
                ))
            else:
                categories.append(c)

        if has_video and has_speech and has_nlp:
            completeness = "full"
        elif has_nlp:
            completeness = "text_and_nlp"
        elif has_speech:
            completeness = "speech_and_vision"
        else:
            completeness = "partial"

        weighting_rationale = (
            "Multi-modal evaluation calibrated across Content, Speech, Communication, and Non-Verbal delivery."
        )

    # Compute overall score from active categories
    active_categories = [c for c in categories if c.data_source != "unavailable"]
    if not active_categories:
        active_categories = categories

    total_weight = sum(c.weight for c in active_categories)
    overall = round(sum(c.weighted_score for c in active_categories) / max(total_weight, 0.001))
    overall = max(0, min(100, overall))

    grade, label = _grade(overall)

    formula_parts = " + ".join(
        f"{c.label}({c.score}×{c.weight})" for c in active_categories
    )
    formula = f"({formula_parts}) = {overall}"

    # Cross-category insights
    all_strengths = [s for c in categories for s in c.strengths if s]
    all_suggestions = [s for c in categories for s in c.suggestions if s]

    if not all_strengths:
        if overall >= 75:
            all_strengths = ["Strong performance across measured interview criteria."]
        else:
            all_strengths = ["Completed interview recording analysis."]

    if not all_suggestions:
        all_suggestions = ["Practice regular mock interviews to build consistent performance."]

    top_strength = all_strengths[0]
    top_suggestion = all_suggestions[0]

    return ScoringResult(
        overall_score=overall,
        overall_grade=grade,
        overall_label=label,
        categories=categories,
        top_strength=top_strength,
        top_suggestion=top_suggestion,
        formula=formula,
        weighting_rationale=weighting_rationale,
        has_video_analysis=has_video,
        has_audio_analysis=has_speech,
        has_nlp_analysis=has_nlp,
        data_completeness=completeness,
    )
