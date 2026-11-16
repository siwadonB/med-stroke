# MedStroke — AI-Assisted Stroke-Aware Food Guidance

A mobile-first prototype that helps users reflect on food choices in the context of stroke prevention. Users select a food photograph, choose a prevention context, and receive an easy-to-read Thai-language assessment informed by retrieved excerpts from stroke-prevention guidelines.

> **Medical disclaimer:** MedStroke is an educational research/prototype application, not a medical device. Its outputs are not a diagnosis, individualized dietary prescription, or a substitute for a qualified healthcare professional. A photograph cannot reliably establish ingredients, portion size, sodium content, or a person's clinical risk.

## What the application does

- **Food-photo analysis:** Select a photograph from the device gallery and send it to a Gemini vision model for a structured estimate of the dish, visible/possible ingredients, cooking method, and visual characteristics.
- **Two prevention contexts:** Choose between general/primary prevention and secondary prevention for someone with a previous stroke or transient ischemic attack (TIA).
- **Guideline-assisted interpretation:** Retrieve relevant text passages from an offline-prepared collection of American Heart Association/American Stroke Association (AHA/ASA) guidelines, then use Gemini to formulate dietary guidance.
- **Readable Thai results:** Display a suggested food verdict (suitable / suitable with adjustments / best avoided), an explanation, ingredients to be cautious about, and practical improvement suggestions.
- **Evidence and uncertainty display:** Show supporting document titles, sections, page labels, excerpt summaries, uncertain observations, and an evidence-sufficiency label.
- **General food guidance:** Provide examples of food patterns to favor or limit before an image is analyzed.

The current UI uses Thai for the guidance and results.

## Architecture

~~~text
Expo / React Native application
   └─ Food photo + prevention context
       └─ POST /analyze (multipart/form-data)
           └─ Express API
               ├─ Gemini vision: identify dish, ingredients, and visual traits
               ├─ Query expansion: Thai/English ingredient hints + nutrition signals
               ├─ Local guideline retrieval: keyword/section scoring over JSON chunks
               └─ Gemini text generation: assessment + limitations
                   └─ Structured JSON response
                       └─ Result summary and details in the mobile app
~~~

**Retrieval implementation:** The local index is built from guideline PDFs using Python and pypdf. It uses overlapping text chunks and rule/keyword-based ranking; it is **not** an embedding-based vector database. Prevention mode affects query terms and ranking, rather than exclusively filtering to a single document.

## Technology stack

| Layer | Technologies |
| --- | --- |
| Mobile | Expo SDK 54, React Native, React 19, TypeScript, Expo Router |
| Image selection | expo-image-picker, expo-image-manipulator |
| API | Node.js, Express 5, Multer, CORS, dotenv |
| AI | Google Gemini generateContent API (vision and structured text output) |
| Retrieval | Local JSON guideline index, lexical scoring and keyword expansion |
| PDF preprocessing | Python 3 and pypdf |

## Project structure

~~~text
med-stroke/
├── mobile/
│   ├── app/(tabs)/index.tsx      # Image selection, mode selection, main assessment
│   ├── app/result-detail.tsx     # Findings, suggestions, uncertainty, references
│   ├── components/stroke-ui.tsx  # Shared presentation components
│   └── lib/result-store.ts      # In-memory latest-result store
└── server/
    ├── index.js                 # REST API, Gemini calls, retrieval and interpretation
    └── rag/
        ├── build_rag.py         # Offline PDF-to-JSON index builder
        ├── source/              # Guideline source PDFs
        └── index.json           # Prebuilt retrieval index
~~~

## Local development

### Prerequisites

- Node.js and npm (Node.js 20+ is recommended for the Expo toolchain).
- Android emulator, or an Expo-compatible mobile development environment.
- A Google Gemini API key with access to the configured model.
- Python 3 and pypdf **only if you need to rebuild** the guideline index.

### 1. Configure and start the backend

From the repository root:

~~~bash
cd server
npm ci
~~~

Create or update a **local** server/.env file with your own values:

~~~dotenv
GEMINI_API_KEY=your_gemini_api_key
MODEL=gemini-2.5-flash
PORT=8080
RAG_TOPK=3
DEFAULT_GUIDELINE_MODE=primary_prevention
DEBUG=0
~~~

Then start the API:

~~~bash
node index.js
~~~

Check http://localhost:8080/health for the server and index status. The API requires server/rag/index.json to exist and contain chunks.

### 2. Optionally rebuild the retrieval index

The repository already includes a prebuilt index and its source guideline PDFs. To rebuild from the PDFs:

~~~bash
python -m pip install pypdf
python server/rag/build_rag.py
~~~

The builder reads PDFs from server/rag/source and writes server/rag/index.json.

### 3. Start the mobile application

From another terminal:

~~~bash
cd mobile
npm ci
npx expo start
~~~

**Important networking note:** The mobile API endpoint is currently hardcoded as http://10.0.2.2:8080 in mobile/app/(tabs)/index.tsx, which targets the host machine from an **Android emulator**. For a physical phone or another emulator/platform, change API_BASE to an address reachable from that device and configure the network and transport appropriately. This prototype does not currently provide an in-app server-address setting.

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | / | Basic response |
| GET | /health | Check model/index status and loaded document/chunk counts |
| POST | /analyze | Upload a food image and select a prevention context |

The /analyze request uses multipart/form-data with an **image** file field and an optional **guideline_mode** value of primary_prevention or secondary_prevention. The response includes assessment, image_analysis, interpretation and references objects.

## Guideline sources

The local retrieval material includes AHA/ASA stroke-prevention guideline PDFs from **2024** (primary prevention) and **2021** (prevention after stroke or TIA). The results surface retrieved page/section information, but the brief extracts and generated explanations should not be treated as independently verified, claim-by-claim clinical citations. Consult the original guidelines for authoritative wording and context.

## Current limitations and responsible use

- The system infers food properties visually; hidden ingredients, seasoning, nutrition quantities, allergens and patient-specific restrictions are unknown.
- Retrieval is lexical and may miss relevant passages or select imperfect matches.
- Gemini can make mistakes even when required to return structured JSON.
- The latest assessment is held in memory on the mobile side; there is no user account, longitudinal patient record, or clinical validation workflow.
- Uploaded photographs are sent through the backend to an external AI service. Do not submit sensitive patient information without appropriate authorization and privacy controls.
- This is a **prototype** and has not been validated for clinical decision-making or production security.

**Security:** Keep API keys in local environment files, exclude secrets from version control, and rotate credentials if they have ever been committed or exposed. Review upload limits, authentication, logging and error handling before any public deployment.

## Development status

Research/educational prototype. The repository contains the working application structure and implementation, but it does not include a validated clinical study or an automated backend test suite.
