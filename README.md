# CV Analyzer

A polyglot distributed system that helps Malaysian CS students identify ATS keyword gaps between their CV and a job description, with copy-paste ready bullet point rewrites.

## Architecture

Four services orchestrated with Docker Compose:

| Service | Tech | Role |
|---------|------|------|
| api | Node.js + Express + TypeScript | HTTP entry, Zod validation, produces Redis jobs |
| worker | Python 3.11 | BRPOP loop, PDF extraction, LLM call, writes to PostgreSQL |
| redis | redis:7-alpine | Job queue between api and worker |
| db | postgres:16 | Shared database |

**Request flow:**
1. User uploads CV (PDF) + pastes job description
2. API validates, writes PENDING row to PostgreSQL, pushes job to Redis, returns job_id
3. Python worker picks up job via BRPOP, extracts PDF text, calls Gemini LLM
4. Worker writes match score + keyword gaps + rewritten bullets to PostgreSQL
5. User polls GET /analyze/:jobId for result

## Tech Stack

- **API:** Node.js 20, Express, TypeScript, Prisma, Zod, Multer, ioredis, Winston
- **Worker:** Python 3.11, redis-py, pdfplumber, google-genai, psycopg2, pydantic
- **Infrastructure:** PostgreSQL 16, Redis 7, Docker Compose

## Getting Started

### Prerequisites
- Docker and Docker Compose installed
- Google AI API key

### Setup

1. Clone the repository
```bash
   git clone https://github.com/jeremytey/cv-analyzer.git
   cd cv-analyzer
```

2. Create `.env` file in the root directory
```env
   GOOGLE_AI_KEY=your_google_ai_key_here
```

3. Start all services
```bash
   docker-compose up --build
```

4. API is available at `http://localhost:3000`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /analyze | Upload CV + job description, returns job_id |
| GET | /analyze/:jobId | Poll for analysis result |
| GET | /health | Health check |

## Project Structure