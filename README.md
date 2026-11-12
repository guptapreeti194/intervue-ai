# 🎤 InterVue AI
### AI-Powered Interview Performance Analyzer

<div align="center">

![InterVue AI](https://img.shields.io/badge/InterVue%20AI-v2.0-8b5cf6?style=for-the-badge)
![Python](https://img.shields.io/badge/Python-3.10%2B-3776ab?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=for-the-badge&logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/Project-7th%20Sem%20Minor-green?style=for-the-badge)

**7th Semester Minor Project | Team Size: 5 Members**

*An end-to-end multi-modal AI system combining Natural Language Processing (NLP), Computer Vision (CV), and Speech Signal Analysis to deliver objective, structured, and explainable interview performance evaluations.*

[📖 Read Project Documentation](#-project-overview) • [👥 Team Division](#-team-division--work-distribution) • [🎓 Viva & Defense Q&A Guide](file:///c:/Users/KIIT0001/Desktop/InterVue%20AI/intervue-ai/VIVA_QA.md) • [🚀 Quick Start](#-getting-started)

</div>

---

## 📌 Project Overview

Candidates preparing for competitive job interviews often lack accessible, objective, and multi-dimensional feedback. While candidates may understand conceptual technical topics, they frequently struggle with:
- Suboptimal speaking rates (rushing or hesitating)
- High filler word density (*"um", "like", "basically", "you know"*)
- Lack of structure and incomplete concept coverage in technical answers
- Low eye contact engagement or excessive erratic head/body movement
- Anxiety-induced pacing and lack of speech consistency

**InterVue AI** solves this problem by providing an automated, explainable, and multi-modal assessment platform. It processes spoken responses and video recordings through three dedicated AI pipelines, synthesizing them into actionable scores and granular recommendations:

| Module | Core Technology | Primary Metrics & Deliverables |
|--------|----------------|--------------------------------|
| 🧠 **Core AI & NLP Engine** *(Preeti Gupta)* | `sentence-transformers` (`all-MiniLM-L6-v2`), PyTorch, scikit-learn | Semantic similarity (cosine distance), 6-dimension rubric analysis, concept coverage ratio, multi-modal master scoring synthesis |
| 🎙️ **Speech Analysis** | Regex tokenizers, Python NLP, faster-whisper, librosa | Words Per Minute (WPM), 22+ filler word detection patterns, Type-Token Ratio (TTR), pause duration heuristics, speaking consistency |
| 👁️ **Computer Vision** | OpenCV, MediaPipe Face Mesh, Morphological Trackers | Eye contact alignment proxy, face visibility %, head movement variance ($\sigma_{XY}$), posture consistency, ambient lighting score |
| 📊 **Dynamic Master Scoring** *(Preeti Gupta)* | Weighted composite engine, dynamic modality rebalancer | Explainable composite score (0–100), letter grade (A/B/C/D/F), prioritized strengths, actionable suggestions |

---

## 💡 System Architecture

The following diagram illustrates the complete data flow from user interaction to the final interactive report:

```text
                             Candidate Input
                    ┌───────────────────────────────┐
                    │  Live Practice (Speech/Text)  │
                    │              OR               │
                    │  Recorded Video / Audio Media │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   FastAPI Gateway   │
                         │   (Asynchronous)    │
                         └──────────┬──────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
          ▼                         ▼                         ▼
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│  Audio Processing │     │  Computer Vision  │     │   NLP & Semantics │
│  & Speech Cadence │     │  & Non-Verbal     │     │   (Preeti Gupta)  │
├───────────────────┤     ├───────────────────┤     ├───────────────────┤
│ • Whisper STT     │     │ • Adaptive Face   │     │ • MiniLM-L6-v2    │
│ • WPM Calculation │     │   Detection       │     │ • Cosine Sim (0-1)│
│ • 22+ Fillers     │     │ • Eye Contact %   │     │ • 6D Rubric       │
│ • Vocab Richness  │     │ • Head Stability  │     │ • Concept Coverage│
│ • Pause Heuristics│     │ • Posture/Lighting│     │ • Semantic Drift  │
└─────────┬─────────┘     └─────────┬─────────┘     └─────────┬─────────┘
          │                         │                         │
          └─────────────────────────┼─────────────────────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Multi-Modal Master  │
                         │   Scoring Engine    │
                         │   (Preeti Gupta)    │
                         ├─────────────────────┤
                         │ • Modality Weights  │
                         │ • Dynamic Rebalance │
                         │ • Grade & Feedback  │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   React 19 Frontend │
                         │   Interactive UI    │
                         ├─────────────────────┤
                         │ • Practice Session  │
                         │ • Video Preview     │
                         │ • SVG Radar Charts  │
                         │ • Persistent Store  │
                         └─────────────────────┘
```

---

## 👥 Team Division & Work Distribution

For the 7th Semester Minor Project, technical responsibilities are divided equally across **5 team members**, with each member owning a major sub-system and **Preeti Gupta** owning the main Core AI/ML & NLP Evaluation Engine:

```
                            PROJECT TEAM RESPONSIBILITY MATRIX (5 MEMBERS)
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│   Preeti Gupta    │ │   Pravy Jha   │ │   Shikha Kumari  │ │   Krish Gupta   │ │   Tanvi Mishra   │
├───────────────────┤ ├───────────────────┤ ├───────────────────┤ ├───────────────────┤ ├───────────────────┤
│ Core AI / ML &    │ │ Speech Processing │ │ Computer Vision & │ │ Backend Gateway & │ │ Frontend UI/UX &  │
│ NLP Semantic      │ │ & Acoustic        │ │ Non-Verbal        │ │ Adaptive Question │ │ Interactive SVG   │
│ Scoring Engine    │ │ Intelligence      │ │ Analysis          │ │ Database          │ │ Visualizations    │
└───────────────────┘ └───────────────────┘ └───────────────────┘ └───────────────────┘ └───────────────────┘
```

### 1. Preeti Gupta — Core AI/ML Engine & NLP Evaluation Specialist
* **Primary Ownership**: Core AI Evaluation Engine, Multi-Modal Master Scoring Engine (`scoring_engine.py`), NLP Answer Relevance & Semantic Evaluation (`analysis_service.py`), Dynamic Modality Rebalancing.
* **Key Deliverables & Responsibilities**:
  1. **Transformer-Based Semantic Evaluation**: Implemented `sentence-transformers/all-MiniLM-L6-v2` generating 384-dimensional dense semantic vector embeddings. Implemented cosine similarity calculation between candidate responses and reference knowledge outlines.
  2. **6-Dimensional Rubric Engine**: Architected the weighted rubric system evaluating *Relevance (20%), Coverage (20%), Explanation (15%), Structure (15%), Confidence (15%),* and *Pacing (15%)*.
  3. **Concept Coverage Extraction**: Formulated semantic thresholding ($\text{sim} \ge 0.52$) plus token matching to calculate conceptual breadth against expected industry answers.
  4. **Multi-Modal Master Scoring Engine**: Designed the composite scoring algorithm uniting NLP, speech, and computer vision outputs. Designed the **dynamic modality rebalancer** that automatically adjusts weights when video or speech is uploaded without transcripts so scores never collapse to artificial defaults.
  5. **Cross-Category Feedback Synthesis**: Engineered algorithms to isolate top strengths and highest-priority actionable suggestions.

### 2. Team Member 2 — Speech Processing & Acoustic Intelligence Engineer
* **Primary Ownership**: `speech_analyzer.py`, Audio transcription pipeline integration (`faster-whisper`), acoustic signal metrics.
* **Key Deliverables & Responsibilities**:
  1. **Cadence & WPM Analysis**: Built words-per-minute calculator calibrated against conversational norms ($130\text{ WPM}$ ideal baseline; penalty curves below 100 or above 180).
  2. **Filler Word Detection**: Created regex and token-level dictionary covering 22 single and multi-word filler patterns (*"um", "uh", "like", "you know", "basically", "actually"*).
  3. **Vocabulary Richness**: Formulated Type-Token Ratio ($\text{TTR} = \frac{\text{Unique Words}}{\text{Total Words}}$) and repetition penalty metrics for repeated bigrams/trigrams.
  4. **Pause Heuristics**: Created pause frequency and duration estimation algorithms based on punctuation cues and audio silence thresholding.

### 3. Team Member 3 — Computer Vision & Non-Verbal Analysis Engineer
* **Primary Ownership**: `vision_analyzer.py`, Video frame extraction, OpenCV video pipeline, MediaPipe integration.
* **Key Deliverables & Responsibilities**:
  1. **Adaptive Face & Head Tracking**: Built a resilient two-tier detection system: MediaPipe Face Mesh when available, with an adaptive color-space (YCrCb/HSV) and morphological contour tracker that works across all OpenCV versions.
  2. **Eye Contact Proxy**: Computed camera gaze alignment using facial centroid proximity to camera optical center and eye-band symmetry.
  3. **Head Movement Stability**: Measured standard deviation ($\sigma_{XY}$) of head position across sampled video frames to categorize stability into Controlled, Moderate, or Excessive.
  4. **Posture & Environmental Analysis**: Computed bounding box area variation across time to assess postural slouching/swaying, along with grayscale luminance histograms to score lighting quality.

### 4. Team Member 4 — Backend Architecture & Question Bank Engineer
* **Primary Ownership**: `main.py` (FastAPI REST service), `adaptive.py` (Session state machine), `question_bank.json`.
* **Key Deliverables & Responsibilities**:
  1. **Asynchronous REST API**: Implemented 12+ high-performance endpoints in FastAPI using asynchronous execution, Pydantic validation, and CORS middleware.
  2. **Adaptive Question Selection**: Engineered rule-based adaptive selection algorithm that dynamically picks next questions based on past topic scores ($< 55$ prioritizes practice) and adjusts difficulty on consecutive high performance.
  3. **Comprehensive Question Bank**: Authored and curated 74 technical and behavioral interview questions across 6 industry roles, complete with difficulty levels, topics, reference outlines, and required concepts.
  4. **Multipart File Ingestion**: Built secure file streaming handlers for video/audio files up to 200 MB with temporary file lifecycle management.

### 5. Team Member 5 — Frontend Engineering & Data Visualization Specialist
* **Primary Ownership**: React 19 + TypeScript web application (`src/pages/*`, `src/components/*`), Web Speech API, SVG charts.
* **Key Deliverables & Responsibilities**:
  1. **Adaptive Practice UI (`Practice.tsx`)**: Created the full interview simulation flow featuring question prompts, concept hints, Web Speech API audio recording, and live answer scoring.
  2. **Upload & Media Preview (`Upload.tsx`)**: Built drag-and-drop recording interface with HTML5 video/audio preview player, question selector, and optional transcript editor.
  3. **Analytics Dashboard (`Analytics.tsx`)**: Created pure SVG data visualizations (no heavy external chart libraries) including 6-axis Radar chart, session score timeline, and topic mastery breakdown.
  4. **Session Persistence**: Developed browser `localStorage` synchronization for seamless offline storage of practice and upload reports.

---

## 🗂️ Project Structure

```text
intervue-ai/
│
├── backend/                             # Python FastAPI backend + all ML modules
│   ├── main.py                          # FastAPI REST endpoints & multipart pipeline
│   ├── analysis_service.py              # NLP semantic engine (Preeti Gupta)
│   ├── scoring_engine.py                # Master scoring engine & rebalancer (Preeti Gupta)
│   ├── speech_analyzer.py               # Speech processing (WPM, fillers, TTR, pauses)
│   ├── vision_analyzer.py               # Computer vision (face/eye/head/posture tracking)
│   ├── adaptive.py                      # Adaptive session state & topic routing
│   ├── question_bank.json               # 74 curated questions with rubrics across 6 roles
│   ├── requirements.txt                 # Backend dependencies
│   └── .venv/                           # Python virtual environment
│
├── src/                                 # React 19 + TypeScript frontend
│   ├── pages/
│   │   ├── Landing.tsx                  # Landing page & feature showcase
│   │   ├── Dashboard.tsx                # High-level statistics & quick launch
│   │   ├── Practice.tsx                 # Adaptive interview session with Web Speech API
│   │   ├── Upload.tsx                   # Media upload with video preview player
│   │   ├── UploadReport.tsx             # Dedicated persistent upload report view
│   │   ├── Analytics.tsx                # SVG radar charts, score timelines, topic mastery
│   │   ├── Report.tsx                   # Practice session detailed diagnostic report
│   │   └── History.tsx                  # Saved interview session registry
│   ├── components/
│   │   ├── Navbar.tsx                   # Global navigation header
│   │   └── Footer.tsx                   # Application footer
│   ├── utils/
│   │   ├── analysis.ts                  # API client & TypeScript interfaces
│   │   ├── sessions.ts                  # Practice session storage helpers
│   │   └── uploadSessions.ts            # Upload session storage & builders
│   ├── data/
│   │   └── question_bank.json           # Bundled offline fallback question bank (74 Qs)
│   └── index.css                        # Dark violet/cyan custom design system
│
├── VIVA_QA.md                           # Exhaustive Project Defense & Viva Q&A Guide
├── start_backend.bat                    # Windows one-click backend startup script
├── start_backend.ps1                    # PowerShell startup script
├── package.json                         # Frontend dependencies & scripts
└── README.md                            # Main project documentation
```

---

## 🔑 Deep-Dive into Implemented Features

### Feature 1 — 🧠 Transformer-Based NLP Evaluation (`analysis_service.py`)
*Developed by: Preeti Gupta*

Rather than relying on naive keyword matching, InterVue AI performs dense semantic representation using Sentence-BERT (`sentence-transformers/all-MiniLM-L6-v2`):
- **Model Parameters**: 6 Transformer layers, 384 embedding dimensions, 22.7M parameters.
- **Cosine Similarity Metric**:
  $$\text{Cosine Similarity}(Q, A) = \frac{\vec{u} \cdot \vec{v}}{\|\vec{u}\|_2 \|\vec{v}\|_2}$$
  Maps candidate semantic vectors against gold-standard answer outlines into a normalized range $[0.0, 1.0]$.
- **6-Dimensional Rubric System**:
  - *Relevance (20%)*: Direct alignment with the core question prompt.
  - *Coverage (20%)*: Ratio of required domain concepts mentioned.
  - *Explanation (15%)*: Presence of concrete examples, mechanisms, and reasoning.
  - *Structure (15%)*: Introductory framing, logical flow, and conclusion.
  - *Confidence (15%)*: Ratio of assertive phrasing vs hedging language.
  - *Pacing (15%)*: Proportionality between question scope and response depth.

### Feature 2 — 📊 Dynamic Multi-Modal Scoring Engine (`scoring_engine.py`)
*Developed by: Preeti Gupta*

In standard multi-modal mode, scores are combined according to pedagogical priority:
$$\text{Score}_{\text{Full}} = 0.35 \times \text{NLP} + 0.30 \times \text{Speech} + 0.20 \times \text{Comm} + 0.15 \times \text{Non-Verbal}$$

**Dynamic Modality Rebalancing**:
When a candidate uploads a video recording without a spoken transcript, missing NLP inputs previously penalized the candidate. Preeti Gupta designed an adaptive rebalancer that dynamically recalibrates the visual modality into 4 distinct performance categories:
1. **Eye Contact & Engagement (35%)**: Evaluates gaze stability and optical axis alignment.
2. **Body Language & Stability (25%)**: Evaluates head motion standard deviation.
3. **Framing & Face Visibility (20%)**: Percentage of sampled frames with clear facial tracking.
4. **Posture & Lighting Quality (20%)**: Evaluates bounding box area consistency and luminance.

### Feature 3 — 🎙️ Speech & Cadence Analysis (`speech_analyzer.py`)
- **Words Per Minute (WPM)**: Measured against conversational comfort zones ($110 - 160\text{ WPM}$ scored at $100\%$; parabolic drop-off outside).
- **Filler Word Detection**: Evaluates 22 specific filler patterns:
  - Single tokens: *"um", "uh", "er", "ah", "like", "basically", "literally", "actually"*
  - Multi-word phrases: *"you know", "i mean", "sort of", "kind of"*
- **Type-Token Ratio (TTR)**: Analyzes lexical diversity to reward diverse technical vocabulary.
- **Pause Analysis**: Identifies hesitations and awkward silences using punctuation heuristics and acoustic thresholding.

### Feature 4 — 👁️ Computer Vision & Non-Verbal Analysis (`vision_analyzer.py`)
- **Dual-Engine Face Tracking**: Runs MediaPipe Face Mesh for iris tracking (landmarks 468–477). If running in a headless environment, smoothly falls back to an adaptive YCrCb/HSV skin-tone and morphological contour detector.
- **Head Movement Standard Deviation**:
  $$\sigma_{XY} = \sqrt{\frac{1}{N} \sum_{i=1}^N \left((x_i - \bar{x})^2 + (y_i - \bar{y})^2\right)}$$
  Low $\sigma_{XY}$ indicates steady composure; high $\sigma_{XY}$ highlights nervous swaying.
- **Lighting & Posture Consistency**: Analyzes luminance mean and standard deviation to detect backlighting or underexposure.

### Feature 5 — 📚 74-Question Multi-Role Question Bank
The system includes 74 curated questions covering 6 major industry roles:
1. **Software Engineer (General)**: Algorithms, system design, data structures, concurrency.
2. **Frontend Developer**: DOM, CSS layout, React lifecycle, performance optimization, Web APIs.
3. **Backend Developer**: Database indexing, REST vs gRPC, caching, microservices, transactions.
4. **Data Scientist / ML Engineer**: Bias-variance tradeoff, overfitting, gradient descent, metrics.
5. **DevOps & Cloud Engineer**: CI/CD pipelines, Docker containerization, Kubernetes, infrastructure as code.
6. **Behavioral & Leadership**: STAR method questions, conflict resolution, project leadership.

---

## 🛠️ Complete Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Frontend** | React | 19.x | Component-based reactive UI |
| **Frontend** | TypeScript | 5.x | Strict end-to-end type safety |
| **Frontend** | Vite | 6.x | Fast HMR dev server and optimized production bundler |
| **Frontend** | Web Speech API | Browser Native | Live speech-to-text recording |
| **Backend** | Python | 3.10 – 3.12 | Primary machine learning runtime |
| **Backend** | FastAPI | 0.115 | Asynchronous REST API framework |
| **Backend** | Uvicorn | 0.30 | ASGI server |
| **Backend** | Pydantic v2 | 2.x | Request/response data validation |
| **Machine Learning** | Sentence-Transformers | 3.x | `all-MiniLM-L6-v2` dense semantic embeddings |
| **Machine Learning** | PyTorch | 2.x | Tensor computations for Transformer model |
| **Machine Learning** | scikit-learn | 1.4+ | Vector cosine similarity calculation |
| **Computer Vision** | OpenCV | 4.x / 5.x | Frame processing, color space transforms, contour tracking |
| **Computer Vision** | MediaPipe | 0.10+ | Face mesh and iris tracking (optional enhancement) |
| **Speech** | Faster-Whisper | 1.x | Local speech-to-text transcription (optional enhancement) |

---

## 🚀 Getting Started

### Prerequisites
- **Python 3.10 – 3.12** installed
- **Node.js 18+** installed
- Modern Chromium-based browser (Chrome, Edge, Brave) for Web Speech API

### Step 1: Clone the Project
```bash
git clone https://github.com/your-team/intervue-ai.git
cd intervue-ai
```

### Step 2: Backend Setup
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Step 3: Run the Backend
```powershell
# From the backend/ folder:
.\.venv\Scripts\uvicorn main:app --reload --port 8000
```
*Note: The Sentence-Transformer model (~90 MB) downloads automatically on first launch.*

### Step 4: Run the Frontend
```powershell
# In a separate terminal from project root:
npm install
npm run dev
```
Open **http://localhost:5173** in your browser.

---

## 🌐 API Reference Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server status, model availability, and question bank count |
| `GET` | `/questions` | List questions with role, difficulty, and topic filters |
| `POST` | `/analyze/v2` | Full NLP semantic and rubric evaluation for a candidate's answer |
| `POST` | `/next-question` | Adaptive question recommendation engine based on session history |
| `POST` | `/interview/upload-analyze` | End-to-end multi-modal pipeline for uploaded video/audio recordings |
| `POST` | `/interview/speech-analyze` | Standalone speech and cadence analysis from transcript |

---


## 🔐 Privacy & Ethical Considerations

- **Local Execution**: All NLP inference and computer vision processing occur locally on the hosting machine without transmitting candidate recordings to third-party proprietary APIs.
- **Ephemeral Storage**: Uploaded video files are temporarily processed in memory/isolated temporary storage and deleted immediately upon analysis completion.
- **Behavioral Indicators**: Results are framed strictly as objective coaching metrics (e.g., *estimated eye contact proxy*, *words per minute*) rather than definitive psychological diagnoses.

---

<div align="center">
<b>InterVue AI — 7th Semester Minor Project</b><br>
<i>Department of Computer Science & Engineering</i>
</div>
