import os
import json
import logging
import threading
from typing import List
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from google.genai.errors import APIError

logger = logging.getLogger("worker.llm_client")

# Threading primitives to ensure safe instantiation in concurrent environments
_client_lock = threading.Lock()
_client_instance = None

def get_llm_client() -> genai.Client:
    """
    Thread-safe lazy initializer for the Gemini SDK Client.
    Defers environment parsing and SDK configuration past import collection time.
    """
    global _client_instance

    if _client_instance is not None:
        return _client_instance

    with _client_lock:
        if _client_instance is None:
            if not os.environ.get("GEMINI_API_KEY"):
                logger.critical("CRITICAL ENVIRONMENT ERROR: 'GEMINI_API_KEY' variable is missing from runtime context.")
                raise ValueError("GEMINI_API_KEY environment variable must be populated before invoking the LLM layer.")

            try:
                logger.info("Initializing Gemini SDK Client (Deferred Connection Mode)...")
                _client_instance = genai.Client()
                logger.info("✅ Gemini SDK Client successfully initialized.")
            except Exception as init_err:
                logger.critical(f"Failed to initialize Gemini SDK client wrapper: {str(init_err)}")
                raise

    return _client_instance


class BulletPointRewrite(BaseModel):
    original: str = Field(
        description="The original weak or unoptimized bullet point extracted verbatim from the candidate's CV."
    )
    rewritten: str = Field(
        description=(
            "The upgraded bullet point. Use X-Y-Z: Accomplished [X] as measured by [Y], by doing [Z]. "
            "Must contain: (1) what was built — specific, not vague, "
            "(2) the exact technical stack named inline (not in a separate section), "
            "(3) a measurable outcome — if a real metric exists in the CV, use it exactly. "
            "If no metric exists, insert a bracketed placeholder: [X users], [Y ms], [Z% coverage], "
            "[N downloads] — never invent a specific number. "
            "LENGTH CONSTRAINT: Maximum 25 words. Every word must earn its place. "
            "A candidate must be able to fit this on a one-page CV without reformatting. "
            "Do not use: 'spearheaded', 'robust', 'passionate', 'team player', or any filler. "
            "The candidate fills in bracketed placeholders with real figures before submitting."
        )
    )
    justification: str = Field(
        description=(
            "One sentence, maximum 20 words. Name the exact keyword or signal this rewrite closes "
            "and why it matters to a Grab, Sea Group, or GoTo recruiter for this specific role."
        )
    )


class AnalysisStructure(BaseModel):
    keyword_gaps: List[str] = Field(
        description=(
            "Hard technical keywords, frameworks, tools, or architectural concepts "
            "explicitly required by the job description but absent from the CV. "
            "Binary evaluation only — present or absent. No partial credit. "
            "Do not list soft skills. Do not list anything the CV already demonstrates. "
            "Do not list generic tools like 'Git' unless the job requires them and they are genuinely absent. "
            "Each gap must be a single term or short phrase, not a sentence."
        )
    )
    rewritten_bullet_points: List[BulletPointRewrite] = Field(
        description=(
            "Targeted rewrites of the candidate's weakest existing bullet points. "
            "Each rewrite must close at least one identified keyword gap. "
            "Do not fabricate experience the candidate does not have. "
            "Elevate what exists — add stack specificity, action verbs, measurable outcomes. "
            "Use varied action verbs across bullets: built, engineered, reduced, automated, "
            "migrated, optimised, deployed, instrumented, published, shipped. "
            "Never repeat the same verb twice. "
            "Stack must be named inline in the bullet, not referenced separately."
        )
    )
    stack_redundancy_warning: str = Field(
        default="",
        description=(
            "If the candidate has used the same core stack across multiple projects "
            "(e.g., two Node.js + MongoDB REST APIs), write one sentence flagging this. "
            "State that recruiters at Grab and Sea Group read identical stacks as one skill built twice. "
            "Name one concrete architectural addition that would demonstrate depth for this role. "
            "If no redundancy exists, return an empty string."
        )
    )
    one_page_verdict: str = Field(
        description=(
            "One sentence assessing whether the CV's bullet points are concise enough for a one-page format. "
            "Industry standard for internship and fresh graduate applications in Malaysia and Singapore "
            "is strictly one page. If bullets are verbose or padded, say so and name the worst offender. "
            "If the CV is already concise, confirm it."
        )
    )


class MasterOutputSchema(BaseModel):
    match_score: float = Field(
        description=(
            "ATS match percentage, strictly bounded 0.00–100.00. "
            "Score based on hard keyword coverage of core job requirements only. "
            "Do not inflate. A score above 80 means the CV is genuinely strong for this role. "
            "A score below 40 means the candidate will likely be filtered before human review."
        )
    )
    detailed_analysis: AnalysisStructure


def generate_analysis(cv_text: str, job_description: str) -> dict:
    """
    Dispatches CV text and job description to Gemini 2.5 Flash.
    Enforces Malaysian and Southeast Asian tech recruiter screening standards.
    Output is structured via Pydantic schema — no free-form text.
    """
    if not cv_text.strip() or not job_description.strip():
        raise ValueError("LLM execution boundary failed. Context payloads cannot be empty strings.")

    # Retrieve our lazy client connection mapping
    client = get_llm_client()

    system_instruction = (
        "You are a Principal Engineer and Technical Recruiting Lead at a Tier-1 Southeast Asian "
        "tech company — the calibre of Grab, Sea Group (Shopee), or GoTo. "
        "You are auditing a candidate's CV against a specific job description. "
        "Your evaluation must meet the bar these companies actually screen for.\n\n"

        "RULE 1 — BINARY KEYWORD EVALUATION:\n"
        "A technical skill is either present in the CV or it is not. "
        "Do not give partial credit. If PostgreSQL appears in a project description, it counts. "
        "If Docker is not mentioned anywhere, it is a gap. "
        "Only flag gaps for skills the job description explicitly requires.\n\n"

        "RULE 2 — STACK DIVERSITY AUDIT:\n"
        "If the candidate has built multiple projects using the same core stack, "
        "flag this in stack_redundancy_warning. "
        "Recruiters at Grab and Sea Group read identical stacks as one skill built twice, not two projects. "
        "Name one concrete architectural addition for this specific role: "
        "async queues, distributed caching, containerisation, CI/CD, or polyglot service boundaries.\n\n"

        "RULE 3 — BULLET REWRITING STANDARD:\n"
        "Format: Accomplished [X] as measured by [Y], by doing [Z]. "
        "Every rewritten bullet must contain:\n"
        "  (1) What was built — specific, not vague.\n"
        "  (2) The exact technical stack named inline in the bullet itself.\n"
        "  (3) A measurable outcome — if a real metric exists in the CV, use it exactly as stated. "
        "If no metric exists, use a bracketed placeholder: [X users], [Y ms], [Z% test coverage], "
        "[N downloads]. Never invent a specific number. "
        "The candidate fills in placeholders with real figures before submitting their CV.\n"
        "LENGTH: Maximum 25 words per bullet. This is a hard limit. "
        "A candidate must be able to place this on a one-page CV without reformatting. "
        "Internship and fresh graduate CVs in Malaysia and Singapore are strictly one page. "
        "Verbose bullets are a formatting failure, not just a style preference.\n"
        "VERBS: Use a different action verb for each bullet. "
        "Valid verbs: built, engineered, reduced, automated, migrated, optimised, "
        "deployed, instrumented, published, shipped, architected, integrated.\n\n"

        "RULE 4 — HONESTY OVER INFLATION:\n"
        "Do not fabricate experience. Do not use filler: "
        "'spearheaded robust solutions', 'team player', 'passionate about technology'. "
        "Do not treat calling a third-party API as an engineering skill — "
        "API consumption is not engineering depth. "
        "If a metric is implausible or unverifiable, remove it and reframe around process quality. "
        "The candidate must be able to defend every line in a technical interview.\n\n"

        "RULE 5 — SEA MARKET SIGNALS:\n"
        "Grab, Sea Group, GoTo, and ByteDance SG screen specifically for: "
        "type safety (TypeScript, typed Python), testing discipline (unit + integration coverage), "
        "CI/CD awareness, system design signals (async patterns, distributed components, caching), "
        "and scalability thinking. "
        "Weight these signals heavily in gap identification and bullet rewrites.\n\n"

        "RULE 6 — ONE-PAGE DISCIPLINE:\n"
        "The gold standard for internship CVs is one page. "
        "Jake Ryan's resume format is the target: each bullet under 25 words, "
        "stack named inline, metric present, action verb first. "
        "Assess whether the candidate's existing bullets meet this standard in one_page_verdict. "
        "If they do not, name the specific bullet that is worst.\n\n"

        "RULE 7 — WHAT GOOD LOOKS LIKE:\n"
        "Strong bullet (metric in CV): 'Engineered Redis-backed async job queue in Node.js and Python, "
        "reducing p95 API response time from 28s to 210ms under concurrent load.' (22 words) "
        "Strong bullet (no metric in CV): 'Engineered Redis-backed async job queue in Node.js and Python, "
        "reducing p95 API response time by [X ms] under concurrent load.' "
        "Strong bullet (metric in CV): 'Published Minecraft plugin via TravisCI CD pipeline — "
        "2K+ downloads, 4.5/5 stars across 200+ reviews.' (17 words) "
        "Weak bullet: 'Worked on backend APIs using various technologies to improve system performance.' "
        "Every rewrite must move from weak toward strong. "
        "Never invent numbers — use bracketed placeholders when real evidence is absent from the CV."
        "Every rewrite must move from weak toward strong."
    )

    prompt = f"""
Audit the candidate CV below against the job description.

Your tasks:
1. Identify every hard technical keyword the job requires that the CV does not demonstrate.
2. Check for stack redundancy across projects. Populate stack_redundancy_warning if found.
3. Rewrite the candidate's weakest bullet points using X-Y-Z, inline stack, measurable outcome, max 25 words.
4. Assess one-page discipline in one_page_verdict.
5. Do not fabricate experience. Elevate what exists with precision, honesty, and conciseness.

---
TARGET JOB DESCRIPTION:
{job_description}
---
CANDIDATE CV TEXT:
{cv_text}
---
"""

    try:
        logger.info("Dispatching CV analysis payload to Gemini 2.5 Flash...")

        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.1,
                response_mime_type="application/json",
                response_schema=MasterOutputSchema,
            ),
        )

        raw_text = response.text
        if not raw_text:
            raise RuntimeError("Gemini returned an empty response.")

        structured_data = json.loads(raw_text)

        return {
            "match_score": float(structured_data.get("match_score", 0.0)),
            "analysis_results": structured_data.get("detailed_analysis", {})
        }

    except APIError as api_err:
        # Isolate transient upstream overload from fatal credential mismatches
        err_str = str(api_err).lower()
        if api_err.code == 503 or "overloaded" in err_str or "unavailable" in err_str:
            raise ValueError(
                "[Gemini Service Unavailable] Upstream AI engine is currently overloaded with "
                "concurrent requests. Please wait a few minutes before trying again."
            )
        elif api_err.code == 403 or "api key" in err_str or "api_key" in err_str:
            raise ValueError(
                "[Gemini Configuration Error] Upstream authentication failure. "
                "The host provider rejected the API key credential."
            )
        else:
            raise ValueError(f"[Gemini API Error] {str(api_err)}")

    except Exception as ai_err:
        logger.error({
            "message": "LLM generation failed.",
            "error": str(ai_err)
        })
        raise