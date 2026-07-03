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

Real problem validation (5 CS students interviewed on their actual application 
behaviour, not hypothetical survey answers) is documented in [RESEARCH.md](./RESEARCH.md).

---

## Architecture

> **If you're reviewing this before an interview:** read the two subsections 
> below the table first. They're the strongest engineering signal in this repo.

Four services orchestrated with Docker Compose:

| Service | Tech | Role |
|---------|------|------|
| api | Node.js 20 + Express + TypeScript | HTTP entry, Zod validation, file upload, produces Redis jobs |
| worker | Python 3.11 | BRPOP consumer loop, PDF extraction, LLM call, writes results to PostgreSQL |
| redis | redis:7-alpine | Async job queue between api and worker |
| db | postgres:16 | Shared persistent store for job state and results |

The LLM system instruction enforces binary keyword evaluation, X-Y-Z bullet 
formatting, and a 25-word conciseness constraint. Calibrated against Malaysian 
tech recruiter screening standards.

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
**Worker:** Python 3.11, redis-py, pdfplumber, google-genai, psycopg3, Pydantic  
**Infrastructure:** PostgreSQL 16, Redis 7, Docker Compose  

---

## Getting Started

### Prerequisites
- Docker and Docker Compose (provisions PostgreSQL and Redis automatically — 
  no separate local database setup required)
- Google AI API key (Gemini 2.5 Flash)

### Setup

```bash
git clone https://github.com/jeremytey/cv-analyzer.git
cd cv-analyzer
```

Create `.env` in the root:

```env
GEMINI_API_KEY=your_key_here
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
python -m pytest worker/tests/ -v
```

8 Node integration tests (1 skipped) · 7 Python unit tests

---

## Project Structure

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

---

## License

MIT