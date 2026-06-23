# CV Analyzer

A polyglot distributed system that helps Malaysian CS students 
identify ATS keyword gaps between their CV and a job description, with 
copy-paste ready bullet point rewrites.

**Live URL:** _to be added on deployment_

---

## Why This Exists

Most CS students in Malaysia tailor CVs by gut feel with no 
signal on whether their CV contains the keywords ATS systems and recruiters 
actually scan for. When rejected, they have no way to diagnose why.

This tool runs a gap analysis between a CV and a specific job description, 
returns a match score, identifies missing keywords, and generates rewritten 
bullet points that close those gaps — copy-paste ready.

---

## Problem Validation

Five CS students at Malaysian universities were interviewed about their actual 
job application behaviour. Key findings:

- **5/5** reported ghosting and zero feedback as their primary frustration
- **4/5** tailor CVs manually by gut feel with no structured system
- **3/5** explicitly mentioned not knowing whether their CV is ATS-friendly
- **2/5** identified Canva editing friction as a secondary execution pain point

Selected responses:

> "The most frustrating part is spending a lot of time applying for jobs but 
> getting little or no response. It can also be difficult to know whether my 
> CV is good enough or ATS-friendly for the role." — Anonymous, CS student

> "I don't send the exact same CV every time. I keep one master CV and spend 
> 5–10 mins customizing it per application — reordering bullet points, adding 
> keywords from the job description. The uncertainty and time wasted is the 
> worst." — Anonymous, CS student

> "My CV is built on Canva, and every time editing certain details requires me 
> to adjust the overall design, move the text and images, which is a bit 
> frustrating." — Anonymous, CS student

> "Many places have 'Drop your Resume' QR codes. In my case, 99% of the time 
> I will not get any response from the team." — Anonymous, CS student

> "I tailor my CV depending on the company — mostly changing the skills part 
> and experience to reflect the relevant skills the company needs." 
> — Dex, CS student

Zero of the five students had a systematic way to verify whether their CV 
contained the keywords a specific job description required. This tool is built 
to close that gap.

---

## Architecture

Four services orchestrated with Docker Compose:

| Service | Tech | Role |
|---------|------|------|
| api | Node.js 20 + Express + TypeScript | HTTP entry, Zod validation, file upload, produces Redis jobs |
| worker | Python 3.11 | BRPOP consumer loop, PDF extraction, LLM call, writes results to PostgreSQL |
| redis | redis:7-alpine | Async job queue between api and worker |
| db | postgres:16 | Shared persistent store for job state and results |

### Why async via Redis instead of synchronous LLM calls

PDF extraction plus LLM generation takes 10–30 seconds per request. Calling 
Gemini synchronously inside the Express request-response cycle breaks under 
three conditions:

- **Gateway timeouts:** Nginx, Cloudflare, and most reverse proxies drop the 
  connection with a 504 before the LLM finishes.
- **Event loop pressure:** Concurrent heavy uploads under synchronous load 
  cause event loop lag that degrades every other in-flight request.
- **Rate limit bursts:** 50 simultaneous submissions would fire 50 concurrent 
  Gemini API calls, hitting 429s immediately. Redis smooths traffic to a 
  controlled consumption rate.

### Why DB write happens before Redis push

The PENDING row is written to PostgreSQL before the job is pushed to Redis. 
If the API crashes between those two steps, the worker never sees the job. 
If Redis push fails after the DB write, the row exists and is recoverable via 
reconciliation. The reverse ordering — push to Redis first — produces a phantom 
job the worker tries to process against a row that does not exist yet, causing 
immediate foreign key failures with no recovery path.

### Known limitation

If the Python worker crashes mid-job, the DB row stays stuck at PROCESSING 
indefinitely. There is no heartbeat or dead-letter queue mechanism in the 
current MVP. A time-threshold sweeper or visibility timeout would fix this 
post-MVP.

---

## Request Flow

1. User uploads CV (PDF) + pastes job description
2. API validates inputs via Zod, writes PENDING row to PostgreSQL, pushes job 
   payload to Redis, returns `jobId` with 202
3. Python worker picks up job via BRPOP, transitions row to PROCESSING
4. Worker extracts text via pdfplumber, calls Gemini 2.5 Flash with structured 
   output schema enforced via Pydantic
5. Worker writes match score + keyword gaps + rewritten bullets to PostgreSQL, 
   transitions row to COMPLETED or FAILED
6. Frontend polls `GET /api/v1/analyze/:jobId` every 2 seconds until terminal 
   state, then renders results

---

## Tech Stack

**API:** Node.js 20, Express, TypeScript, Prisma, Zod, Multer, ioredis, Winston  
**Worker:** Python 3.11, redis-py, pdfplumber, google-genai, psycopg2, Pydantic  
**Infrastructure:** PostgreSQL 16, Redis 7, Docker Compose  

---

## Getting Started

### Prerequisites
- Docker and Docker Compose
- Google AI API key (Gemini 2.5 Flash)

### Setup

```bash
git clone https://github.com/jeremytey/cv-analyzer.git
cd cv-analyzer
```

Create `.env` in the root:

```env
GOOGLE_API_KEY=your_key_here
```

Start all services:

```bash
docker-compose up --build
```

API available at `http://localhost:3000`  
Frontend available at `http://localhost:5173`

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/analyze | Upload CV + job description, returns jobId |
| GET | /api/v1/analyze/:jobId | Poll for analysis result |
| GET | /api/v1/health | Health check |

---

## Tests

```bash
# API integration tests (Node)
cd api && npm test

# Worker unit tests (Python)
cd worker && pytest
```

8 Node integration tests · 4 Python unit tests

---

## Project Structure

## Project Structure
```
cv-analyzer/
├── docker-compose.yml       # Orchestrates local development (DB, Queue, App containers)
├── .dockerignore            # Excludes global node_modules and virtual environments
├── .env                     # Contains host environment tokens (e.g., GEMINI_API_KEY)
│
├── api/                     # Node.js + TypeScript Producer API
│   ├── prisma/              # Database schema definition and migrations
│   └── src/
│       ├── routes/          # Express route definitions & HTTP endpoints
│       ├── controllers/     # Request validation and orchestration layer
│       ├── services/        # Business logic & job publishing to queue
│       ├── repositories/    # Direct database queries via Prisma Client
│       └── middlewares/     # Auth, error handling, and file upload interceptors
│
├── frontend/                # React + TypeScript + Vite Single Page Application (SPA)
│   ├── src/                 # Application codebase (Components, Hooks, Styles)
│   ├── public/              # Static public assets
│
└── worker/                  # Python Consumer Worker (Heavy Processing)
    ├── main.py              # Worker entry point & message queue listener
    └── modules/
        ├── pdf_extractor.py # Text parsing and preprocessing from uploaded CVs
        ├── llm_client.py    # Structured parsing & prompt execution via LLM API
        └── db_client.py     # Direct data persistence for processing results
```
---

## User Feedback Log

_To be added after real user testing._

---

## License

MIT