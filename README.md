# Ask India 🇮🇳

**A synthetic focus group for India** — ask any question and hear from thousands of AI-generated Indian personas, each with a unique demographic profile. Responses are visualised on an interactive map of India, colour-coded by sentiment.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![Groq](https://img.shields.io/badge/LLM-Groq-orange)
![Leaflet](https://img.shields.io/badge/Map-Leaflet-green?logo=leaflet)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## What It Does

1. **You ask a question** — e.g. _"Should India make college education free for all?"_
2. **30 synthetic personas respond** — sampled from a dataset of 5,000 personas spanning all 36 Indian states & UTs
3. **Each persona answers in character** — based on their age, sex, occupation, education level, and home state
4. **Sentiment analysis** classifies each response as positive / neutral / negative
5. **The map lights up** — states with responses glow green (positive), amber (neutral), or red (negative); states without responses stay dim
6. **Click a state** to filter the results panel to just that state's responses

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 16](https://nextjs.org) (App Router, TypeScript) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| **LLM Inference** | [Groq](https://groq.com) — ultra-fast inference (~3s for 30 parallel persona responses) |
| **Models** | Llama 3.3 70B (default), Llama 3.1 8B, Gemma 2 9B, Mixtral 8×7B |
| **Map** | [Leaflet](https://leafletjs.com) — SVG renderer, no WebGL required |
| **Validation** | [Zod](https://zod.dev) — request/response schema validation |
| **Persona Dataset** | [NVIDIA Nemotron-Personas-India](https://huggingface.co/datasets/nvidia/Nemotron-Personas-India) (CC BY 4.0) |

---

## Project Structure

```
ask-india/
├── app/
│   ├── api/
│   │   ├── ask/route.ts          # POST — send question, get persona responses
│   │   └── options/route.ts      # GET  — available states, occupations, models
│   ├── layout.tsx                # Root layout (dark mode, Leaflet CSS)
│   ├── page.tsx                  # Entry point → renders AskIndiaApp
│   └── map-test/page.tsx         # Standalone Leaflet diagnostic page
├── components/
│   ├── ask-india-app.tsx         # Main app UI (audience panel, input, results)
│   ├── india-map.tsx             # Leaflet map with sentiment-based state colouring
│   └── ui/                      # shadcn/ui components (Badge, Button, Card, etc.)
├── lib/
│   ├── groq-llm.ts              # Groq SDK wrapper, prompt builder
│   ├── model-catalog.ts         # Available LLM models
│   ├── persona-store.ts         # Loads & indexes 5,000 personas from JSON
│   ├── rate-limit.ts            # Simple IP-based rate limiter
│   ├── sampling.ts              # Demographic-filtered random sampling
│   ├── schemas.ts               # Zod schemas (AskRequest, PersonaResponse, etc.)
│   ├── sentiment.ts             # Keyword + LLM-based sentiment scorer
│   └── utils.ts                 # Tailwind merge utility
├── public/
│   ├── data/
│   │   ├── india-states.geojson          # India state boundaries (35 features)
│   │   ├── personas.compact.india.json   # 5,000 synthetic personas (~5 MB)
│   │   └── personas.compact.india.meta.json
│   ├── leaflet.css               # Leaflet stylesheet
│   └── leaflet-images/           # Leaflet marker icons
├── scripts/
│   ├── prepare_personas_india.py         # Download & compact NVIDIA personas
│   └── download_india_geojson.py         # Download India state GeoJSON
├── .env.example                  # Required environment variables
└── next.config.ts
```

---

## How It Works

### Persona Pipeline
The `scripts/prepare_personas_india.py` script downloads the [NVIDIA Nemotron-Personas-India](https://huggingface.co/datasets/nvidia/Nemotron-Personas-India) dataset from HuggingFace and compacts it into a JSON file with 5,000 personas. Each persona has:
- **State** (all 36 states & UTs)
- **Age**, **Sex**
- **Occupation** (200+ unique occupations)
- **Education level**

### Request Flow
```
User asks a question
        │
        ▼
POST /api/ask  ──►  Sample 30 personas (filtered by age, sex, state, occupation)
        │
        ▼
   For each persona, build a system prompt with their full demographic profile
        │
        ▼
   Send all 30 prompts to Groq in parallel (p-limit concurrency: 10)
        │
        ▼
   Each response is sentiment-analysed (positive / neutral / negative + confidence)
        │
        ▼
   Aggregate state-level sentiment scores
        │
        ▼
   Return { responses[], state_sentiments{}, summary{} }
```

### Map Visualisation
- **No responses yet** → all states shown as dark slate polygons
- **After responses** → states with respondents glow by dominant sentiment:
  - 🟢 **Green** (`score > 0.2`) — positive
  - 🟡 **Amber** (`-0.1 < score ≤ 0.2`) — neutral
  - 🔴 **Red** (`score ≤ -0.1`) — negative
- **Unsampled states** dim to near-invisible (40% opacity)
- **Click a state** to select it (95% opacity, bright border) and filter results

---

## Getting Started

### Prerequisites
- **Node.js** 18+
- **Groq API key** — free at [console.groq.com/keys](https://console.groq.com/keys)

### Installation

```bash
# Clone the repo
git clone https://github.com/mm0177/glowing-octo-spork.git
cd glowing-octo-spork/ask-india

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local and add your GROQ_API_KEY
```

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment (Vercel)

This app is designed for [Vercel](https://vercel.com) — it auto-detects Next.js.

1. Push to GitHub
2. Import the repo on [vercel.com/new](https://vercel.com/new)
3. Set **Root Directory** to `ask-india`
4. Add environment variables:
   - `GROQ_API_KEY` — your Groq API key
   - `NEXT_PUBLIC_MAPBOX_TOKEN` — optional (not needed with Leaflet)
5. Deploy

> **Note:** The personas JSON (~5 MB) and India GeoJSON (~22 MB) are included in the repo and served as static files from `public/data/`.

---

## Audience Filters

The left panel lets you narrow the persona sample:

| Filter | Options |
|---|---|
| **Age range** | 18–120 (default 18–65) |
| **Sample size** | 5–100 (default 30) |
| **Sex** | Any, Male, Female |
| **States** | All 36 states & UTs, or pick specific ones |
| **Occupations** | All 200+ occupations, or pick specific ones |
| **Model** | Llama 3.3 70B, Llama 3.1 8B, Gemma 2 9B, Mixtral 8×7B |

---

## API Reference

### `POST /api/ask`
Send a question to synthetic personas.

**Request body:**
```json
{
  "question": "Should India make college education free for all?",
  "age_min": 18,
  "age_max": 65,
  "sample_size": 30,
  "sex": "any",
  "states": [],
  "occupations": [],
  "model": "llama-3.3-70b-versatile"
}
```

**Response:**
```json
{
  "responses": [
    {
      "uuid": "...",
      "state": "KARNATAKA",
      "profile": { "age": 34, "sex": "Female", "occupation": "Teacher", "education_level": "Graduate" },
      "answer": "I strongly believe...",
      "reasoning": "The response reflects...",
      "sentiment": "positive",
      "confidence": 0.9
    }
  ],
  "state_sentiments": {
    "KARNATAKA": { "positive": 3, "neutral": 1, "negative": 0, "dominant": "positive", "score": 0.75 }
  },
  "summary": { "total": 30, "positive": 27, "neutral": 3, "negative": 0 },
  "request_id": "..."
}
```

### `GET /api/options`
Returns available states, occupations, and models.

---

## Data Sources

| Dataset | Source | License |
|---|---|---|
| **Personas** | [NVIDIA Nemotron-Personas-India](https://huggingface.co/datasets/nvidia/Nemotron-Personas-India) | CC BY 4.0 |
| **India GeoJSON** | [GADM](https://gadm.org) via geoBoundaries | Open Database License |

---

## Disclaimer

> All responses are **AI-generated from synthetic personas** — they do **not** represent real people's opinions. This is a demonstration of LLM capabilities with structured demographic prompting, not a substitute for actual surveys or polling.

---

## License

MIT
