# 🎓 StudyMate (Study Buddy)

StudyMate is an advanced AI-powered learning companion that combines real-time voice interaction, dynamic AI personas, deep document intelligence, and an immersive 3D visual experience. It functions as a study assistant, storyteller, and intelligent research partner in a single unified interface.

---

## 🚀 Features

## 🎙️ Core Live Interaction

- **Real-time Voice Communion**
  - Low-latency, bidirectional audio interaction using the **Gemini 2.5 Flash Native Audio API**

- **Live Transcription Overlay**
  - Dual real-time transcription display:
    - User speech in **orange**
    - Assistant / Orus speech in **white**

- **Voice Switching**
  - Professional **Kore voice** for standard interactions
  - Dynamic tone shift during storytelling sessions

- **Tactile Controls (Glassmorphism UI)**
  - **Start / Stop Recording**
    - Primary control with pulsing red *Record* indicator
  - **Contextual Restart**
    - Clears session state and starts a new conversation
  - **Activity Journal**
    - Toggleable history panel for transcriptions and system events

---

## 🎭 Dynamic Personas

### Dual-Mode Intelligence

- **Study Mode**
  - Simple, direct, and professional assistant
  - Designed for academic queries, document analysis, and explanations

- **Story Mode – Orus**
  - Automatically triggered when the user requests a story
  - Ancient, mystical persona with poetic language
  - Ceremonial greeting and narrative pacing

### Emotional Color Sync (Story Mode Only)

The 3D Orb dynamically changes its emissive glow based on narrative emotion:

- 🔴 **Red** – Sad or tragic moments
- 🟢 **Green** – Happy or positive events
- 🟣 **Purple** – Mystical or magical sequences
- 🟠 **Orange** – Anger, conflict, or intense energy
- ⚪ **Indigo** – Neutral / default state

---

## 🧠 Advanced AI & Grounding

- **Google Search Grounding**
  - Real-time web search integration
  - Extracted source titles and URLs displayed in a dedicated **Grounding Panel**

- **Deep Document Analysis**
  - Supports `.txt`, `.pdf`, and multiple code file formats
  - Powered by **Gemini 3 Pro** for:
    - ATS resume scoring
    - Code optimization suggestions
    - Text summarization

- **Context Integration**
  - Analysis results are injected back into the **Live Audio session**
  - Assistant can verbally explain document insights

---

## ✨ Visual Experience (3D & Shaders)

- **Interactive 3D Orb**
  - High-fidelity **Three.js** sphere
  - Reacts to both input and output audio frequencies

- **Environment Mapping**
  - EXR HDR environment maps
  - Realistic metallic reflections and lighting

- **Aurora Shader Background**
  - GPU-accelerated animated shaders
  - Intensifies motion during search and analysis states

- **Particle System – Data Flux**
  - Cosmic particle effects during searching, reconnecting, and system transitions

---

## 🛡️ Robustness & Session Management

- **Auto-Mending Link**
  - Detects network errors and closed connections
  - Automatically reconnects using exponential backoff

- **State Persistence**
  - Preserves user name, subject focus, and conversation history
  - Seamless recovery after socket reconnections

- **Personalized Onboarding**
  - Custom setup flow capturing:
    - User name
    - Primary topic of interest
  - Used to prime system instructions for personalization

- **Live Status Monitoring**
  - Bottom-screen status indicator:
    - `Listening`
    - `Searching`
    - `Analyzing`
    - `Mending link`

---

## 🛠️ Tech Stack

- **Frontend:** LitElement (Web Components)
- **3D & Graphics:** Three.js, Custom GLSL Shaders
- **AI / LLM:** Google Gemini (2.5 Flash, 3 Pro)
- **Voice:** Native Audio API, Web Speech APIs
- **Backend & Auth:** Supabase
- **Search Grounding:** Google Search Integration

---

## 🎯 Vision

StudyMate aims to redefine digital learning by combining:
- Voice-first AI interaction
- Emotional storytelling intelligence
- Deep analytical reasoning
- Immersive visual feedback

---

## 🔮 Future Enhancements

- Multi-language voice interaction
- Personalized learning paths
- Collaborative study rooms
- Offline document intelligence
- AI-generated study plans and reminders

---

## 🤝 Contributions

Contributions, issues, and feature requests are welcome.  
Feel free to fork the repository and submit a pull request.
