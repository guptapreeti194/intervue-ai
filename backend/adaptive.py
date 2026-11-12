"""
InterVue AI — Adaptive Question Selection Engine
================================================

Policy: transparent rule-based selection (not a trained RL model).
After each answer, the engine:
  1. Updates the candidate's skill profile for the relevant topic.
  2. Decides whether to maintain, raise, or lower difficulty.
  3. Selects the next question targeting the weakest relevant topic.
  4. Avoids repeating questions already seen in this session.
  5. Records its reasoning for every selection.

All logic is deterministic and inspectable.
"""

from __future__ import annotations

import json
import logging
import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

logger = logging.getLogger(__name__)

QUESTION_BANK_PATH = Path(__file__).parent / "question_bank.json"
DIFFICULTY_ORDER = ["Easy", "Medium", "Hard"]


# ──────────────────────────────────────────────────────────────────────────────
# Data types
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class Question:
    id: str
    text: str
    role: str
    topic: str
    subtopic: str
    difficulty: str
    type: str              # "Technical" | "HR" | "Behavioral"
    expected_concepts: list[str]
    reference_answer: str
    rubric_hints: list[str]
    follow_ups: list[str]
    source: str


@dataclass
class TopicPerformance:
    topic: str
    attempts: int = 0
    total_score: float = 0.0
    recent_scores: list[float] = field(default_factory=list)

    @property
    def average_score(self) -> float:
        if self.attempts == 0:
            return 50.0   # neutral prior
        return round(self.total_score / self.attempts, 1)

    @property
    def recent_average(self) -> float:
        if not self.recent_scores:
            return self.average_score
        return round(sum(self.recent_scores) / len(self.recent_scores), 1)


@dataclass
class SessionState:
    role: str
    difficulty: str
    answered_question_ids: list[str] = field(default_factory=list)
    topic_performance: dict[str, TopicPerformance] = field(default_factory=dict)
    question_count: int = 0


@dataclass
class SelectionResult:
    question: Question | None
    reason: str                # human-readable explanation of why this question was chosen
    difficulty_change: Literal["increased", "decreased", "maintained"]
    target_topic: str | None
    no_more_questions: bool = False


# ──────────────────────────────────────────────────────────────────────────────
# Question bank loader
# ──────────────────────────────────────────────────────────────────────────────

_question_bank: list[Question] | None = None


def load_question_bank() -> list[Question]:
    global _question_bank
    if _question_bank is not None:
        return _question_bank

    try:
        raw = json.loads(QUESTION_BANK_PATH.read_text(encoding="utf-8"))
        _question_bank = [Question(**q) for q in raw]
        logger.info("Question bank loaded: %d questions.", len(_question_bank))
    except Exception as exc:  # noqa: BLE001
        logger.error("Could not load question bank: %s", exc)
        _question_bank = []

    return _question_bank


def get_questions_for_role(role: str) -> list[Question]:
    bank = load_question_bank()
    return [q for q in bank if q.role.lower() == role.lower()]


def get_question_by_id(question_id: str) -> Question | None:
    bank = load_question_bank()
    return next((q for q in bank if q.id == question_id), None)


# ──────────────────────────────────────────────────────────────────────────────
# Adaptive Policy
# ──────────────────────────────────────────────────────────────────────────────

# Thresholds for difficulty adjustment (based on last answer score 0–100)
DIFFICULTY_UP_THRESHOLD = 75     # score above this → try a harder question
DIFFICULTY_DOWN_THRESHOLD = 40   # score below this → try an easier question

# Minimum attempts before concluding a topic is weak
MIN_ATTEMPTS_FOR_WEAK_TOPIC = 1


def update_performance(
    state: SessionState,
    topic: str,
    score: float,
) -> None:
    """Record a score for a topic and update the candidate's profile."""
    if topic not in state.topic_performance:
        state.topic_performance[topic] = TopicPerformance(topic=topic)

    tp = state.topic_performance[topic]
    tp.attempts += 1
    tp.total_score += score
    tp.recent_scores = (tp.recent_scores + [score])[-3:]  # keep last 3


def _adjust_difficulty(current_difficulty: str, last_score: float) -> tuple[str, str]:
    """
    Determine next difficulty level based on last answer score.
    Returns (new_difficulty, change_description).
    """
    idx = DIFFICULTY_ORDER.index(current_difficulty) if current_difficulty in DIFFICULTY_ORDER else 1

    if last_score >= DIFFICULTY_UP_THRESHOLD and idx < len(DIFFICULTY_ORDER) - 1:
        new_diff = DIFFICULTY_ORDER[idx + 1]
        return new_diff, "increased"
    elif last_score < DIFFICULTY_DOWN_THRESHOLD and idx > 0:
        new_diff = DIFFICULTY_ORDER[idx - 1]
        return new_diff, "decreased"

    return current_difficulty, "maintained"


def _find_weakest_topic(
    state: SessionState,
    available_topics: set[str],
) -> str | None:
    """
    Find the topic with the lowest recent_average among topics that have
    available unattempted questions.
    Prefers topics with sufficient attempts; otherwise any available topic.
    """
    candidates = [
        tp for tp in state.topic_performance.values()
        if tp.topic in available_topics
    ]

    untried = available_topics - {tp.topic for tp in state.topic_performance.values()}
    if untried:
        # Prefer untried topics to ensure breadth first
        return random.choice(list(untried))

    if not candidates:
        return None

    # Sort by recent average ascending → weakest first
    candidates.sort(key=lambda tp: tp.recent_average)
    return candidates[0].topic


def select_next_question(
    state: SessionState,
    last_score: float | None = None,
    last_question_id: str | None = None,
    follow_up_preferred: bool = False,
) -> SelectionResult:
    """
    Select the next question for the session.

    Algorithm:
      1. Adjust difficulty based on last score.
      2. Identify follow-up candidates from the last question (if preferred).
      3. Filter available questions: same role, new difficulty, not yet seen.
      4. Among candidates, choose the question targeting the weakest topic.
      5. If no targeted question found, fall back to any available question.
      6. Return the selection with a plain-English explanation.
    """
    bank = load_question_bank()
    seen = set(state.answered_question_ids)
    unseen = [q for q in bank if q.id not in seen and q.role.lower() == state.role.lower()]

    if not unseen:
        return SelectionResult(
            question=None,
            reason="All available questions for this role have been answered.",
            difficulty_change="maintained",
            target_topic=None,
            no_more_questions=True,
        )

    # 1. Adjust difficulty
    if last_score is not None:
        new_difficulty, diff_change = _adjust_difficulty(state.difficulty, last_score)
        state.difficulty = new_difficulty
    else:
        new_difficulty = state.difficulty
        diff_change = "maintained"

    # 2. Follow-up check
    if follow_up_preferred and last_question_id:
        last_q = get_question_by_id(last_question_id)
        if last_q and last_q.follow_ups:
            for follow_up_text in last_q.follow_ups:
                match = next(
                    (q for q in unseen if q.text.strip() == follow_up_text.strip()),
                    None,
                )
                if match:
                    return SelectionResult(
                        question=match,
                        reason=f"Follow-up on your previous answer about '{last_q.topic}'.",
                        difficulty_change=diff_change,
                        target_topic=match.topic,
                    )

    # 3. Filter by (new) difficulty — prefer matching, fall back to any
    difficulty_matches = [q for q in unseen if q.difficulty == new_difficulty]
    candidate_pool = difficulty_matches if difficulty_matches else unseen

    # 4. Identify available topics in pool
    available_topics = {q.topic for q in candidate_pool}

    # 5. Find weakest topic
    target_topic = _find_weakest_topic(state, available_topics)

    # 6. Choose a question from that topic (or any from pool)
    if target_topic:
        topic_questions = [q for q in candidate_pool if q.topic == target_topic]
    else:
        topic_questions = candidate_pool

    if not topic_questions:
        topic_questions = candidate_pool

    chosen = random.choice(topic_questions)

    # Build reason string
    reason_parts = []
    if diff_change == "increased":
        reason_parts.append(f"Difficulty increased to {new_difficulty} (your last score was strong).")
    elif diff_change == "decreased":
        reason_parts.append(f"Difficulty reduced to {new_difficulty} (to build confidence).")
    else:
        reason_parts.append(f"Maintaining {new_difficulty} difficulty.")

    if target_topic and state.topic_performance.get(target_topic):
        tp = state.topic_performance[target_topic]
        reason_parts.append(
            f"Targeting '{target_topic}' (your recent average: {tp.recent_average}/100)."
        )
    elif target_topic:
        reason_parts.append(f"Exploring '{target_topic}' — not yet attempted.")

    return SelectionResult(
        question=chosen,
        reason=" ".join(reason_parts),
        difficulty_change=diff_change,
        target_topic=target_topic,
    )
