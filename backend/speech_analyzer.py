"""
InterVue AI — Speech Analysis Module
=====================================

Analyses speech characteristics from:
  1. Raw transcript text (always available)
  2. Audio file via librosa (optional — requires librosa + ffmpeg)

Metrics produced
----------------
  - Words Per Minute (WPM)
  - Total speaking duration (estimated or measured)
  - Filler word frequency and list
  - Pause count and average duration (from text punctuation or audio)
  - Repeated phrase detection (bigrams / trigrams)
  - Speaking consistency score
  - Vocabulary richness (Type-Token Ratio)
  - Answer length classification (short / ideal / long)

All metrics are returned in a typed dataclass so they can be serialised
directly by FastAPI Pydantic models.
"""

from __future__ import annotations

import re
import logging
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

FILLER_WORDS: list[str] = [
    "um", "uh", "like", "basically", "literally", "you know", "right",
    "okay so", "so like", "i mean", "kind of", "sort of", "actually",
    "honestly", "obviously", "essentially", "basically", "anyways",
    "and stuff", "or whatever", "you see", "you get me",
]

# Ideal WPM range for interview answers (research-backed)
WPM_IDEAL_LOW = 110
WPM_IDEAL_HIGH = 160
WPM_FAST_THRESHOLD = 180
WPM_SLOW_THRESHOLD = 90

# Ideal answer lengths (words)
ANSWER_LENGTH_SHORT = 30
ANSWER_LENGTH_IDEAL_MIN = 50
ANSWER_LENGTH_IDEAL_MAX = 250
ANSWER_LENGTH_LONG = 350

# Assuming ~130 WPM when no audio duration is available
DEFAULT_WPM_ESTIMATE = 130


# ── Data types ────────────────────────────────────────────────────────────────

@dataclass
class FillerWord:
    word: str
    count: int
    positions: list[int]   # word indices where found


@dataclass
class RepeatedPhrase:
    phrase: str
    count: int
    phrase_type: str       # "bigram" | "trigram"


@dataclass
class PauseAnalysis:
    estimated_count: int
    estimated_avg_duration_sec: float
    source: str            # "text_punctuation" | "audio_timestamps" | "unavailable"
    note: str


@dataclass
class SpeechAnalysisResult:
    # Core metrics
    word_count: int
    unique_word_count: int
    sentence_count: int
    type_token_ratio: float          # vocabulary richness: unique/total
    estimated_duration_sec: float
    wpm: float

    # WPM quality
    wpm_score: int                   # 0–100
    wpm_label: str                   # "slow" | "good" | "fast"
    wpm_note: str

    # Filler words
    total_filler_count: int
    filler_details: list[dict]       # serialisable list of FillerWord dicts
    filler_score: int                # 0–100, higher = fewer fillers
    filler_note: str

    # Pauses
    pause_analysis: dict             # PauseAnalysis as dict

    # Repeated phrases
    repeated_phrases: list[dict]     # serialisable RepeatedPhrase dicts
    repetition_score: int            # 0–100, higher = less repetition

    # Answer length
    answer_length_label: str         # "very_short" | "short" | "ideal" | "long" | "very_long"
    answer_length_score: int         # 0–100

    # Consistency (sentence-to-sentence length variance)
    consistency_score: int           # 0–100

    # Overall speech score
    speech_score: int                # 0–100 weighted composite
    speech_score_formula: str

    # Qualitative feedback
    strengths: list[str]
    suggestions: list[str]

    # Method metadata
    source: str                      # "text_only" | "audio_enhanced"


# ── Helper functions ──────────────────────────────────────────────────────────

def _tokenize(text: str) -> list[str]:
    return re.findall(r"\b[\w']+\b", text.lower())


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [s.strip() for s in parts if len(s.strip()) > 3]


def _count_filler_words(tokens: list[str], text_lower: str) -> list[FillerWord]:
    """
    Detect filler words using both token matching (single words)
    and substring matching (multi-word fillers like 'you know').
    """
    results: list[FillerWord] = []

    for filler in FILLER_WORDS:
        filler_tokens = filler.split()

        if len(filler_tokens) == 1:
            # Single-word match
            positions = [i for i, t in enumerate(tokens) if t == filler]
            count = len(positions)
        else:
            # Multi-word: count occurrences in full text
            count = text_lower.count(filler)
            positions = []  # positions not tracked for multi-word

        if count > 0:
            results.append(FillerWord(word=filler, count=count, positions=positions))

    return results


def _extract_repeated_phrases(tokens: list[str], min_count: int = 2) -> list[RepeatedPhrase]:
    """
    Find repeated bigrams and trigrams (excluding stop-word-only phrases).
    """
    STOP = {"the", "a", "an", "is", "are", "was", "and", "or", "i", "to", "of", "in", "it", "my", "on"}

    results: list[RepeatedPhrase] = []

    for n, label in [(2, "bigram"), (3, "trigram")]:
        ngrams = [" ".join(tokens[i:i+n]) for i in range(len(tokens) - n + 1)]
        counter = Counter(ngrams)
        for phrase, count in counter.items():
            if count >= min_count:
                words = phrase.split()
                if all(w in STOP for w in words):
                    continue  # skip all-stop-word phrases
                results.append(RepeatedPhrase(phrase=phrase, count=count, phrase_type=label))

    # Sort by count descending, return top 10
    results.sort(key=lambda r: r.count, reverse=True)
    return results[:10]


def _estimate_pauses_from_text(text: str) -> PauseAnalysis:
    """
    Estimate pause count and duration from punctuation patterns.
    Commas → short pauses (~0.5s), sentence boundaries → medium pauses (~1.0s),
    ellipses / dashes → long pauses (~1.5s).
    """
    commas = text.count(',')
    sentence_ends = len(re.findall(r'[.!?]+', text))
    long_pauses = len(re.findall(r'\.{2,}|—|–', text))

    estimated_count = commas + sentence_ends + long_pauses
    total_pause_time = (commas * 0.5) + (sentence_ends * 1.0) + (long_pauses * 1.5)
    avg_duration = round(total_pause_time / estimated_count, 2) if estimated_count > 0 else 0.0

    return PauseAnalysis(
        estimated_count=estimated_count,
        estimated_avg_duration_sec=avg_duration,
        source="text_punctuation",
        note=(
            "Pause count estimated from punctuation patterns. "
            "For accurate pause detection, provide the audio file."
        ),
    )


def _score_wpm(wpm: float) -> tuple[int, str, str]:
    if wpm < WPM_SLOW_THRESHOLD:
        return (40, "slow", f"Speaking rate ({wpm:.0f} WPM) is too slow. Aim for {WPM_IDEAL_LOW}–{WPM_IDEAL_HIGH} WPM.")
    elif wpm > WPM_FAST_THRESHOLD:
        return (45, "fast", f"Speaking rate ({wpm:.0f} WPM) is too fast. Slow down slightly for clarity.")
    elif WPM_IDEAL_LOW <= wpm <= WPM_IDEAL_HIGH:
        return (95, "good", f"Speaking rate ({wpm:.0f} WPM) is in the ideal range ({WPM_IDEAL_LOW}–{WPM_IDEAL_HIGH} WPM).")
    elif wpm < WPM_IDEAL_LOW:
        return (70, "slightly slow", f"Speaking rate ({wpm:.0f} WPM) is slightly slow. Try to speak a bit faster.")
    else:
        return (70, "slightly fast", f"Speaking rate ({wpm:.0f} WPM) is slightly fast. Slow down for clarity.")


def _score_fillers(filler_count: int, word_count: int) -> tuple[int, str]:
    if word_count == 0:
        return 50, "No answer to evaluate."
    rate = filler_count / max(word_count, 1)
    if rate == 0:
        return 100, "No filler words detected — excellent."
    elif rate < 0.02:
        return 85, f"Very few filler words ({filler_count}). Well controlled."
    elif rate < 0.05:
        return 65, f"{filler_count} filler word(s) detected. Acceptable, but try to reduce further."
    elif rate < 0.10:
        return 40, f"{filler_count} filler word(s) detected. Practice reducing fillers like 'um', 'like', 'you know'."
    else:
        return 20, f"High filler word rate ({filler_count} in {word_count} words). Focus on pausing instead of filling."


def _score_answer_length(wc: int) -> tuple[str, int]:
    if wc < 10:
        return "very_short", 20
    elif wc < ANSWER_LENGTH_SHORT:
        return "short", 45
    elif wc <= ANSWER_LENGTH_IDEAL_MAX:
        return "ideal", 95
    elif wc <= ANSWER_LENGTH_LONG:
        return "long", 70
    else:
        return "very_long", 40


def _score_consistency(sentences: list[str]) -> int:
    """
    Measure sentence-length variance. More consistent → higher score.
    """
    if len(sentences) < 2:
        return 60
    lengths = [len(s.split()) for s in sentences]
    mean = sum(lengths) / len(lengths)
    variance = sum((l - mean) ** 2 for l in lengths) / len(lengths)
    # Lower variance = more consistent; normalise to 0–100
    score = max(0, min(100, round(100 - (variance / 20))))
    return score


def _score_repetition(repeated: list[RepeatedPhrase], wc: int) -> int:
    if not repeated or wc == 0:
        return 95
    total_repeated_words = sum(r.count * len(r.phrase.split()) for r in repeated[:5])
    rate = total_repeated_words / wc
    return max(20, min(95, round(95 - rate * 200)))


# ── Main analysis function ────────────────────────────────────────────────────

def analyze_speech_from_text(
    transcript: str,
    duration_seconds: Optional[float] = None,
) -> SpeechAnalysisResult:
    """
    Analyse speech characteristics from a text transcript.

    Parameters
    ----------
    transcript       : The full text of the candidate's answer (or entire interview)
    duration_seconds : Actual recording duration in seconds, if available.
                       When absent, duration is estimated from word count at DEFAULT_WPM.
    """
    text = (transcript or "").strip()
    if not text:
        return _empty_result()

    tokens = _tokenize(text)
    text_lower = text.lower()
    wc = len(tokens)
    unique_wc = len(set(tokens))
    ttr = round(unique_wc / wc, 3) if wc > 0 else 0.0
    sentences = _sentences(text)
    sent_count = len(sentences)

    # Duration & WPM
    if duration_seconds and duration_seconds > 0:
        duration = duration_seconds
        wpm = round((wc / duration) * 60, 1)
        source = "audio_enhanced"
    else:
        wpm = DEFAULT_WPM_ESTIMATE
        duration = round((wc / wpm) * 60, 1)
        source = "text_only"

    wpm_score, wpm_label, wpm_note = _score_wpm(wpm)

    # Filler words
    fillers = _count_filler_words(tokens, text_lower)
    total_fillers = sum(f.count for f in fillers)
    filler_score, filler_note = _score_fillers(total_fillers, wc)

    # Pauses
    pause_analysis = _estimate_pauses_from_text(text)

    # Repeated phrases
    repeated = _extract_repeated_phrases(tokens)
    repetition_score = _score_repetition(repeated, wc)

    # Answer length
    length_label, length_score = _score_answer_length(wc)

    # Consistency
    consistency_score = _score_consistency(sentences)

    # Composite speech score (weighted)
    weights = {"wpm": 0.25, "filler": 0.30, "length": 0.20, "repetition": 0.15, "consistency": 0.10}
    speech_score = round(
        wpm_score * weights["wpm"] +
        filler_score * weights["filler"] +
        length_score * weights["length"] +
        repetition_score * weights["repetition"] +
        consistency_score * weights["consistency"]
    )
    formula = (
        f"WPM({wpm_score}×0.25) + Filler({filler_score}×0.30) + "
        f"Length({length_score}×0.20) + Repetition({repetition_score}×0.15) + "
        f"Consistency({consistency_score}×0.10) = {speech_score}"
    )

    # Qualitative feedback
    strengths: list[str] = []
    suggestions: list[str] = []

    if wpm_label == "good":
        strengths.append(f"Excellent speaking pace ({wpm:.0f} WPM).")
    else:
        suggestions.append(wpm_note)

    if filler_score >= 85:
        strengths.append("Very few or no filler words — confident delivery.")
    elif filler_score < 50:
        suggestions.append(filler_note)

    if length_label == "ideal":
        strengths.append("Answer length is ideal for an interview setting.")
    elif length_label in ("very_short", "short"):
        suggestions.append("Expand your answer with examples or more detail.")
    elif length_label in ("long", "very_long"):
        suggestions.append("Aim for more concise answers (50–200 words is ideal).")

    if ttr >= 0.60:
        strengths.append(f"Good vocabulary variety (TTR: {ttr:.2f}).")
    else:
        suggestions.append(f"Diversify your vocabulary — vocabulary richness (TTR) is {ttr:.2f}.")

    if repeated and repetition_score < 60:
        top = repeated[0].phrase
        suggestions.append(f"Avoid repeating phrases like '{top}' — it was used {repeated[0].count}×.")

    return SpeechAnalysisResult(
        word_count=wc,
        unique_word_count=unique_wc,
        sentence_count=sent_count,
        type_token_ratio=ttr,
        estimated_duration_sec=duration,
        wpm=wpm,
        wpm_score=wpm_score,
        wpm_label=wpm_label,
        wpm_note=wpm_note,
        total_filler_count=total_fillers,
        filler_details=[{"word": f.word, "count": f.count} for f in fillers],
        filler_score=filler_score,
        filler_note=filler_note,
        pause_analysis=pause_analysis.__dict__,
        repeated_phrases=[{"phrase": r.phrase, "count": r.count, "type": r.phrase_type} for r in repeated],
        repetition_score=repetition_score,
        answer_length_label=length_label,
        answer_length_score=length_score,
        consistency_score=consistency_score,
        speech_score=speech_score,
        speech_score_formula=formula,
        strengths=strengths,
        suggestions=suggestions,
        source=source,
    )


def _empty_result() -> SpeechAnalysisResult:
    return SpeechAnalysisResult(
        word_count=0, unique_word_count=0, sentence_count=0,
        type_token_ratio=0.0, estimated_duration_sec=0.0, wpm=0.0,
        wpm_score=0, wpm_label="no_answer", wpm_note="No answer was submitted.",
        total_filler_count=0, filler_details=[], filler_score=0,
        filler_note="No answer to evaluate.",
        pause_analysis={"estimated_count": 0, "estimated_avg_duration_sec": 0.0,
                        "source": "unavailable", "note": "No text to analyse."},
        repeated_phrases=[], repetition_score=0,
        answer_length_label="very_short", answer_length_score=0,
        consistency_score=0, speech_score=0,
        speech_score_formula="0 (no answer)",
        strengths=[], suggestions=["Write or record an answer to receive feedback."],
        source="text_only",
    )


# ── Audio analysis (optional — requires librosa + ffmpeg) ────────────────────

def analyze_speech_from_audio(audio_path: str | Path) -> Optional[dict]:
    """
    Extract audio-level speech features if librosa is available.
    Returns None if librosa or the audio file is unavailable.

    Features extracted:
    - Actual speaking duration
    - Silence/pause detection (energy-based)
    - Fundamental frequency (pitch) statistics
    """
    try:
        import librosa  # type: ignore
        import numpy as np
    except ImportError:
        logger.warning("librosa not installed — audio-level features unavailable.")
        return None

    try:
        y, sr = librosa.load(str(audio_path), sr=None, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))

        # Energy-based silence detection
        frame_length = int(sr * 0.025)    # 25ms frames
        hop_length = int(sr * 0.010)      # 10ms hops
        energy = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
        silence_threshold = float(energy.mean() * 0.15)

        silence_frames = int((energy < silence_threshold).sum())
        total_frames = len(energy)
        silence_ratio = silence_frames / total_frames if total_frames > 0 else 0.0

        # Count silence segments (pauses)
        is_silent = energy < silence_threshold
        pauses = 0
        in_pause = False
        pause_lengths: list[int] = []
        current_pause = 0
        for frame_silent in is_silent:
            if frame_silent:
                if not in_pause:
                    in_pause = True
                current_pause += 1
            else:
                if in_pause:
                    pause_lengths.append(current_pause)
                    pauses += 1
                    current_pause = 0
                in_pause = False

        # Only count pauses > 200ms
        hop_sec = hop_length / sr
        meaningful_pauses = [p for p in pause_lengths if p * hop_sec > 0.2]
        avg_pause_duration = float(
            sum(p * hop_sec for p in meaningful_pauses) / len(meaningful_pauses)
        ) if meaningful_pauses else 0.0

        # Pitch analysis (F0)
        f0, _, _ = librosa.pyin(y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7'))
        voiced_f0 = f0[~np.isnan(f0)]
        pitch_mean = float(np.mean(voiced_f0)) if len(voiced_f0) > 0 else 0.0
        pitch_std = float(np.std(voiced_f0)) if len(voiced_f0) > 0 else 0.0

        return {
            "duration_sec": round(duration, 2),
            "silence_ratio": round(silence_ratio, 3),
            "pause_count": len(meaningful_pauses),
            "avg_pause_duration_sec": round(avg_pause_duration, 2),
            "pitch_mean_hz": round(pitch_mean, 1),
            "pitch_std_hz": round(pitch_std, 1),
            "pitch_variability": "high" if pitch_std > 40 else "moderate" if pitch_std > 20 else "low",
            "source": "audio_librosa",
        }
    except Exception as exc:
        logger.error("Audio analysis failed: %s", exc)
        return None
