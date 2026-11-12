"""
InterVue AI — Computer Vision Analysis Module
=============================================

Analyses non-verbal behaviour from video frames using OpenCV.
Attempts to use MediaPipe Face Mesh for accurate landmark detection;
falls back to OpenCV Haar cascade face detection if MediaPipe is
unavailable (Python 3.13+ compatibility).

Metrics produced
----------------
  Eye Contact Estimation
    - Fraction of frames where gaze approximates camera direction
    - Based on face/iris landmark positions relative to frame centre

  Head Movement Analysis
    - Mean and standard deviation of face bounding box centroid
    - Classified as: stable / moderate / excessive

  Face Visibility
    - Percentage of frames where a face is detected

  Posture Proxy
    - Face size consistency (stable face size → stable posture)

  Lighting Quality
    - Mean frame brightness and contrast assessment

All metrics are normalised to 0–100 scores for the scoring engine.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# ── Feature flags ─────────────────────────────────────────────────────────────

_cv2_available = False
_mediapipe_available = False

try:
    import cv2  # type: ignore
    _cv2_available = True
    logger.info("OpenCV available: %s", cv2.__version__)
except ImportError:
    logger.warning("OpenCV not installed — vision analysis disabled.")

try:
    import mediapipe as mp  # type: ignore
    _mediapipe_available = True
    logger.info("MediaPipe available: %s", mp.__version__)
except ImportError:
    logger.info("MediaPipe not available — using OpenCV Haar cascade fallback.")


# ── Data types ────────────────────────────────────────────────────────────────

@dataclass
class FrameFeatures:
    """Features extracted from a single video frame."""
    face_detected: bool
    face_bbox: Optional[tuple[int, int, int, int]]   # x, y, w, h
    face_centre: Optional[tuple[float, float]]        # normalised 0–1
    face_size_ratio: float                            # face_area / frame_area
    eye_contact_estimate: Optional[float]             # 0–1 (1 = direct contact)
    brightness: float                                 # mean pixel value 0–255
    head_pose_yaw: Optional[float]                    # degrees, None if unavailable
    head_pose_pitch: Optional[float]


@dataclass
class VisionAnalysisResult:
    # Face visibility
    face_visibility_pct: float           # % frames with face detected
    face_visibility_score: int           # 0–100

    # Eye contact
    eye_contact_pct: float               # % frames with estimated eye contact
    eye_contact_score: int               # 0–100
    eye_contact_method: str             # "mediapipe_iris" | "haar_centre_proxy" | "unavailable"

    # Head movement
    head_movement_label: str             # "stable" | "moderate" | "excessive"
    head_movement_score: int             # 0–100 (higher = more stable)
    head_movement_std: float             # std of face centroid X+Y in normalised coords

    # Posture proxy (face size consistency)
    posture_score: int                   # 0–100
    posture_label: str                   # "stable" | "variable" | "very_variable"

    # Lighting
    avg_brightness: float
    lighting_quality: str               # "good" | "dim" | "bright" | "variable"
    lighting_score: int                 # 0–100

    # Summary
    non_verbal_score: int               # 0–100 weighted composite
    non_verbal_score_formula: str
    frames_analysed: int
    video_duration_sec: float
    analysis_method: str                # "mediapipe" | "opencv_haar" | "unavailable"

    strengths: list[str]
    suggestions: list[str]


# ── Face & Head Detection ─────────────────────────────────────────────────────

_haar_face_cascade: Optional[object] = None   # cv2.CascadeClassifier

def _get_haar_cascade():
    global _haar_face_cascade
    if _haar_face_cascade is not None:
        return _haar_face_cascade
    if not _cv2_available:
        return None
    try:
        if not hasattr(cv2, "CascadeClassifier") or not hasattr(cv2, "data") or not hasattr(cv2.data, "haarcascades"):
            return None
        path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        if not Path(path).exists():
            return None
        _haar_face_cascade = cv2.CascadeClassifier(path)
        logger.info("Haar cascade loaded.")
        return _haar_face_cascade
    except Exception as exc:
        logger.debug("Haar cascade unavailable: %s", exc)
        return None


def _detect_face_haar(frame_gray) -> Optional[tuple[int, int, int, int]]:
    cascade = _get_haar_cascade()
    if cascade is None:
        return None
    try:
        faces = cascade.detectMultiScale(frame_gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
        if len(faces) > 0:
            largest = max(faces, key=lambda f: f[2] * f[3])
            return tuple(largest)  # type: ignore
        return None
    except Exception:
        return None


def _detect_face_adaptive(frame_bgr) -> Optional[tuple[int, int, int, int]]:
    """
    Robust computer vision face and head tracker.
    Combines YCrCb/HSV skin chrominance thresholding, morphological clustering,
    and geometric contour filtering. Operates independently of external cascade XMLs.
    """
    try:
        h, w = frame_bgr.shape[:2]
        frame_area = w * h

        # 1. Skin thresholding in YCrCb color space
        ycrcb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2YCrCb)
        mask_ycrcb = cv2.inRange(
            ycrcb,
            np.array([0, 133, 77], dtype=np.uint8),
            np.array([255, 173, 127], dtype=np.uint8),
        )

        # 2. HSV color space support
        hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
        mask_hsv = cv2.inRange(
            hsv,
            np.array([0, 20, 40], dtype=np.uint8),
            np.array([30, 240, 255], dtype=np.uint8),
        )

        combined = cv2.bitwise_and(mask_ycrcb, mask_hsv)

        # 3. Morphological close/open to consolidate facial contours
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
        closed = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel, iterations=2)
        opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel, iterations=1)

        contours, _ = cv2.findContours(opened, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        best_box = None
        best_score = -1.0

        for c in contours:
            area = cv2.contourArea(c)
            if area < frame_area * 0.012 or area > frame_area * 0.70:
                continue

            x, y, fw, fh = cv2.boundingRect(c)
            aspect = fh / max(fw, 1)

            # Human head aspect ratio in video framing
            if not (0.75 <= aspect <= 2.8):
                continue

            cx = (x + fw / 2) / w
            cy = (y + fh / 2) / h

            if cy > 0.82:  # Candidate face in interview video is in upper/mid portion
                continue

            centrality = 1.0 - abs(cx - 0.5)
            score = (area / frame_area) * 0.5 + centrality * 0.5
            if score > best_score:
                best_score = score
                best_box = (x, y, fw, fh)

        if best_box is not None:
            return best_box

        # Fallback: edge/gradient silhouette in upper center
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (7, 7), 0)
        edges = cv2.Canny(blurred, 30, 110)
        edge_contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in edge_contours:
            area = cv2.contourArea(c)
            if area < frame_area * 0.02 or area > frame_area * 0.6:
                continue
            x, y, fw, fh = cv2.boundingRect(c)
            aspect = fh / max(fw, 1)
            cy = (y + fh / 2) / h
            if 0.8 <= aspect <= 2.5 and cy < 0.75:
                if area > best_score:
                    best_score = area
                    best_box = (x, y, fw, fh)

        return best_box
    except Exception as exc:
        logger.debug("Adaptive face detector error: %s", exc)
        return None


def _detect_face(frame_bgr, frame_gray) -> tuple[Optional[tuple[int, int, int, int]], str]:
    """Detects face using Haar cascade if available, falling back to adaptive computer vision."""
    box = _detect_face_haar(frame_gray)
    if box is not None:
        return box, "opencv_haar"
    box = _detect_face_adaptive(frame_bgr)
    if box is not None:
        return box, "opencv_adaptive_tracker"
    return None, "none"


# ── Eye contact estimation ────────────────────────────────────────────────────

def _estimate_eye_contact_haar(
    face_bbox: Optional[tuple[int, int, int, int]],
    frame_shape: tuple[int, int, int],
    frame_bgr: Optional[np.ndarray] = None,
) -> float:
    """
    Estimate eye contact / camera engagement from:
    1. Distance from natural webcam gaze center (0.5, 0.38).
    2. Symmetry and eye-region pixel contrast across the upper third of the face box.
    """
    if face_bbox is None:
        return 0.0
    x, y, w, h = face_bbox
    h_frame, w_frame = frame_shape[:2]
    face_cx = (x + w / 2) / w_frame
    face_cy = (y + h / 2) / h_frame

    # Distance from natural camera gaze center
    dist = math.sqrt((face_cx - 0.5) ** 2 + (face_cy - 0.38) ** 2)
    alignment = max(0.0, 1.0 - (dist / 0.28))

    # Optional symmetry bonus if frame_bgr is provided
    symmetry_score = 0.85
    if frame_bgr is not None:
        try:
            eye_y1 = max(0, y + int(h * 0.15))
            eye_y2 = min(h_frame, y + int(h * 0.48))
            eye_x1 = max(0, x + int(w * 0.12))
            eye_x2 = min(w_frame, x + int(w * 0.88))
            if eye_y2 > eye_y1 and eye_x2 > eye_x1:
                crop = frame_bgr[eye_y1:eye_y2, eye_x1:eye_x2]
                if crop.size > 0:
                    crop_gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
                    cw = crop_gray.shape[1]
                    left = crop_gray[:, :cw // 2]
                    right = cv2.flip(crop_gray[:, cw // 2:], 1)
                    min_w = min(left.shape[1], right.shape[1])
                    if min_w > 5:
                        diff = float(np.mean(np.abs(left[:, :min_w].astype(float) - right[:, :min_w].astype(float))))
                        symmetry_score = max(0.4, min(1.0, 1.0 - (diff / 75.0)))
        except Exception:
            symmetry_score = 0.85

    score = alignment * 0.65 + symmetry_score * 0.35
    return round(float(np.clip(score, 0.0, 1.0)), 3)


# ── MediaPipe face mesh analysis ─────────────────────────────────────────────

def _analyse_frame_mediapipe(frame_rgb, face_mesh) -> FrameFeatures:
    """
    Use MediaPipe Face Mesh for accurate landmark-based analysis.
    Iris landmarks (468–472) provide gaze direction estimation.
    """
    h, w = frame_rgb.shape[:2]
    results = face_mesh.process(frame_rgb)
    brightness = float(np.mean(frame_rgb))

    if not results.multi_face_landmarks:
        return FrameFeatures(
            face_detected=False, face_bbox=None, face_centre=None,
            face_size_ratio=0.0, eye_contact_estimate=None,
            brightness=brightness, head_pose_yaw=None, head_pose_pitch=None,
        )

    lm = results.multi_face_landmarks[0].landmark

    # Face bounding box from landmarks
    xs = [l.x for l in lm]
    ys = [l.y for l in lm]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    face_w = (x_max - x_min) * w
    face_h = (y_max - y_min) * h
    face_bbox = (int(x_min * w), int(y_min * h), int(face_w), int(face_h))
    face_size_ratio = (face_w * face_h) / (w * h)
    face_centre = ((x_min + x_max) / 2, (y_min + y_max) / 2)

    # Head pose (yaw/pitch from nose tip relative to face centre)
    try:
        nose_tip = lm[1]
        chin = lm[152]
        left_ear = lm[234]
        right_ear = lm[454]
        yaw = math.degrees(math.atan2(
            (right_ear.x - left_ear.x),
            abs(right_ear.z - left_ear.z) + 1e-6
        ))
        pitch = math.degrees(math.atan2(
            nose_tip.y - chin.y, abs(nose_tip.z - chin.z) + 1e-6
        ))
    except (IndexError, ZeroDivisionError):
        yaw = pitch = None

    # Iris-based eye contact (landmarks 468–472 left iris, 473–477 right iris)
    try:
        left_iris_cx = lm[468].x
        right_iris_cx = lm[473].x
        left_eye_left = lm[33].x
        left_eye_right = lm[133].x
        right_eye_left = lm[362].x
        right_eye_right = lm[263].x

        left_ratio = (left_iris_cx - left_eye_left) / max(left_eye_right - left_eye_left, 1e-6)
        right_ratio = (right_iris_cx - right_eye_left) / max(right_eye_right - right_eye_left, 1e-6)
        avg_ratio = (left_ratio + right_ratio) / 2
        # Centre ratio ~0.5 = looking at camera
        ec = 1.0 - abs(avg_ratio - 0.5) * 4
        eye_contact = max(0.0, min(1.0, ec))
    except (IndexError, ZeroDivisionError):
        eye_contact = _estimate_eye_contact_haar(face_bbox, frame_rgb.shape)

    return FrameFeatures(
        face_detected=True,
        face_bbox=face_bbox,
        face_centre=face_centre,
        face_size_ratio=face_size_ratio,
        eye_contact_estimate=eye_contact,
        brightness=brightness,
        head_pose_yaw=yaw if isinstance(yaw, float) else None,
        head_pose_pitch=pitch if isinstance(pitch, float) else None,
    )


# ── Main analysis function ────────────────────────────────────────────────────

def analyze_video(
    video_path: str | Path,
    sample_every_n_frames: int = 15,    # sample 1 frame per ~0.5s at 30fps
    max_frames: int = 500,
) -> VisionAnalysisResult:
    """
    Analyse a video file for non-verbal behaviour indicators.

    Parameters
    ----------
    video_path           : Path to the video file (mp4, avi, webm, mov, etc.)
    sample_every_n_frames: Analyse every Nth frame (performance/accuracy trade-off)
    max_frames           : Maximum frames to analyse

    Returns
    -------
    VisionAnalysisResult with all computed metrics. Returns a degraded result
    with 'unavailable' analysis_method if OpenCV is not installed.
    """
    if not _cv2_available:
        return _unavailable_result("OpenCV (cv2) is not installed. Install with: pip install opencv-python-headless")

    path = Path(video_path)
    if not path.exists():
        return _unavailable_result(f"Video file not found: {path}")

    cap = cv2.VideoCapture(str(path))  # type: ignore
    if not cap.isOpened():
        return _unavailable_result(f"Could not open video: {path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0  # type: ignore
    total_frames_in_video = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))  # type: ignore
    video_duration = total_frames_in_video / fps if fps > 0 else 0.0

    # Choose analysis method
    face_mesh = None
    analysis_method = "opencv_haar"
    eye_contact_method = "haar_centre_proxy"

    if _mediapipe_available:
        try:
            mp_face_mesh = mp.solutions.face_mesh  # type: ignore
            face_mesh = mp_face_mesh.FaceMesh(
                static_image_mode=False,
                refine_landmarks=True,     # enables iris landmarks
                max_num_faces=1,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )
            analysis_method = "mediapipe"
            eye_contact_method = "mediapipe_iris"
            logger.info("Using MediaPipe Face Mesh for video analysis.")
        except Exception as exc:
            logger.warning("MediaPipe initialisation failed: %s — falling back to Haar.", exc)

    frame_features: list[FrameFeatures] = []
    frame_idx = 0
    analysed = 0

    try:
        while analysed < max_frames:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % sample_every_n_frames == 0:
                h, w = frame.shape[:2]
                brightness = float(np.mean(frame))

                if face_mesh is not None:
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # type: ignore
                    feats = _analyse_frame_mediapipe(frame_rgb, face_mesh)
                else:
                    frame_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)  # type: ignore
                    face_bbox, det_method = _detect_face(frame, frame_gray)
                    face_detected = face_bbox is not None
                    face_centre = None
                    face_size_ratio = 0.0
                    if face_bbox:
                        x, y, fw, fh = face_bbox
                        face_centre = ((x + fw / 2) / w, (y + fh / 2) / h)
                        face_size_ratio = (fw * fh) / (w * h)
                        if det_method != "none":
                            analysis_method = det_method

                    feats = FrameFeatures(
                        face_detected=face_detected,
                        face_bbox=face_bbox,
                        face_centre=face_centre,
                        face_size_ratio=face_size_ratio,
                        eye_contact_estimate=_estimate_eye_contact_haar(face_bbox, frame.shape, frame) if face_bbox else 0.0,
                        brightness=brightness,
                        head_pose_yaw=None,
                        head_pose_pitch=None,
                    )

                frame_features.append(feats)
                analysed += 1

            frame_idx += 1
    finally:
        cap.release()
        if face_mesh:
            face_mesh.close()

    if not frame_features:
        return _unavailable_result("No frames could be analysed from this video.")

    return _compute_results(frame_features, analysed, video_duration, analysis_method, eye_contact_method)


def _compute_results(
    features: list[FrameFeatures],
    frames_analysed: int,
    video_duration: float,
    analysis_method: str,
    eye_contact_method: str,
) -> VisionAnalysisResult:
    n = len(features)

    # Face visibility
    face_frames = sum(1 for f in features if f.face_detected)
    face_visibility_pct = round(face_frames / n * 100, 1)
    face_visibility_score = min(100, int(face_visibility_pct))

    # Eye contact
    ec_values = [f.eye_contact_estimate for f in features if f.eye_contact_estimate is not None and f.face_detected]
    if ec_values:
        mean_ec = sum(ec_values) / len(ec_values)
        eye_contact_pct = round(mean_ec * 100, 1)
        eye_contact_score = min(100, int(eye_contact_pct))
    else:
        eye_contact_pct = 0.0
        eye_contact_score = 0

    # Head movement (centroid stability)
    centres = [f.face_centre for f in features if f.face_centre is not None]
    if len(centres) >= 2:
        cx_vals = [c[0] for c in centres]
        cy_vals = [c[1] for c in centres]
        std_x = float(np.std(cx_vals))
        std_y = float(np.std(cy_vals))
        head_std = round(math.sqrt(std_x ** 2 + std_y ** 2), 4)
        if head_std < 0.03:
            hm_label, hm_score = "stable", 95
        elif head_std < 0.07:
            hm_label, hm_score = "moderate", 70
        elif head_std < 0.12:
            hm_label, hm_score = "slightly_excessive", 45
        else:
            hm_label, hm_score = "excessive", 20
    else:
        head_std = 0.0
        hm_label, hm_score = "insufficient_data", 60

    # Posture (face size consistency)
    size_vals = [f.face_size_ratio for f in features if f.face_detected]
    if len(size_vals) >= 2:
        size_std = float(np.std(size_vals))
        if size_std < 0.005:
            posture_label, posture_score = "stable", 95
        elif size_std < 0.015:
            posture_label, posture_score = "slightly_variable", 70
        else:
            posture_label, posture_score = "variable", 40
    else:
        size_std = 0.0
        posture_label, posture_score = "insufficient_data", 60

    # Lighting
    brightness_vals = [f.brightness for f in features]
    avg_brightness = round(float(np.mean(brightness_vals)), 1)
    brightness_std = float(np.std(brightness_vals))
    if avg_brightness < 60:
        lighting_quality, lighting_score = "dim", 40
    elif avg_brightness > 210:
        lighting_quality, lighting_score = "overexposed", 50
    elif brightness_std > 40:
        lighting_quality, lighting_score = "variable", 55
    else:
        lighting_quality, lighting_score = "good", 90

    # Composite non-verbal score
    weights = {"eye_contact": 0.35, "head_movement": 0.25, "face_visibility": 0.20,
               "posture": 0.10, "lighting": 0.10}
    non_verbal_score = round(
        eye_contact_score * weights["eye_contact"] +
        hm_score * weights["head_movement"] +
        face_visibility_score * weights["face_visibility"] +
        posture_score * weights["posture"] +
        lighting_score * weights["lighting"]
    )
    formula = (
        f"EyeContact({eye_contact_score}×0.35) + HeadMovement({hm_score}×0.25) + "
        f"FaceVisibility({face_visibility_score}×0.20) + Posture({posture_score}×0.10) + "
        f"Lighting({lighting_score}×0.10) = {non_verbal_score}"
    )

    # Qualitative feedback
    strengths: list[str] = []
    suggestions: list[str] = []

    if face_visibility_score >= 85:
        strengths.append(f"Face clearly visible in {face_visibility_pct:.0f}% of frames.")
    else:
        suggestions.append(f"Ensure your face is visible — detected in only {face_visibility_pct:.0f}% of frames.")

    if eye_contact_score >= 65:
        strengths.append(f"Good estimated eye contact ({eye_contact_pct:.0f}%).")
    else:
        suggestions.append("Maintain more consistent eye contact with the camera.")

    if hm_label == "stable":
        strengths.append("Head position is stable — professional appearance.")
    elif hm_label in ("excessive", "slightly_excessive"):
        suggestions.append("Reduce head movement — excessive motion is distracting.")

    if posture_score >= 80:
        strengths.append("Consistent posture throughout the interview.")
    else:
        suggestions.append("Maintain a consistent sitting position.")

    if lighting_quality == "good":
        strengths.append("Good, consistent lighting throughout.")
    elif lighting_quality == "dim":
        suggestions.append("Improve lighting — your face appears dim in this recording.")

    note = " Note: eye contact is estimated from face position (geometric proxy), not true gaze tracking." if analysis_method == "opencv_haar" else ""
    if note:
        suggestions.append(note.strip())

    return VisionAnalysisResult(
        face_visibility_pct=face_visibility_pct,
        face_visibility_score=face_visibility_score,
        eye_contact_pct=eye_contact_pct,
        eye_contact_score=eye_contact_score,
        eye_contact_method=eye_contact_method,
        head_movement_label=hm_label,
        head_movement_score=hm_score,
        head_movement_std=head_std,
        posture_score=posture_score,
        posture_label=posture_label,
        avg_brightness=avg_brightness,
        lighting_quality=lighting_quality,
        lighting_score=lighting_score,
        non_verbal_score=non_verbal_score,
        non_verbal_score_formula=formula,
        frames_analysed=frames_analysed,
        video_duration_sec=round(video_duration, 2),
        analysis_method=analysis_method,
        strengths=strengths,
        suggestions=suggestions,
    )


def _unavailable_result(reason: str) -> VisionAnalysisResult:
    return VisionAnalysisResult(
        face_visibility_pct=0.0, face_visibility_score=0,
        eye_contact_pct=0.0, eye_contact_score=0,
        eye_contact_method="unavailable",
        head_movement_label="unavailable", head_movement_score=0, head_movement_std=0.0,
        posture_score=0, posture_label="unavailable",
        avg_brightness=0.0, lighting_quality="unavailable", lighting_score=0,
        non_verbal_score=0, non_verbal_score_formula=f"unavailable: {reason}",
        frames_analysed=0, video_duration_sec=0.0,
        analysis_method="unavailable",
        strengths=[],
        suggestions=[reason],
    )
