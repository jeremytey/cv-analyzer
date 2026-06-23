import os
import json
import logging
from typing import List
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

logger = logging.getLogger("worker.llm_client")


class BulletPointRewrite(BaseModel):
    original: str = Field(
        description="The original weak or unoptimized bullet point extracted verbatim from the candidate's CV."
    )
    rewritten: str = Field(
        description=(
            "The upgraded bullet point using the X-Y-Z formula: Accomplished [X] as measured by [Y], by doing [Z]. "
            "Must explicitly name: (1) what was built or engineered, (2) the specific tech stack used, "
            "(3) a realistic measurable result — latency in ms, throughput, users served, hours automated, "
            "cost reduced. No generic phrases. No 'spearheaded robust solutions'. Copy-paste ready."
        )
    )
    justification: str = Field(
        description=(
            "One sentence. State exactly which missing keyword or signal this rewrite closes, "
            "and why that signal matters to a Grab, Sea Group, or GoTo recruiter screening for this role."
        )
    )


class AnalysisStructure(BaseModel):
    keyword_gaps: List[str] = Field(
        description=(
            "Hard technical keywords, frameworks, tools, or architectural concepts required by the job "
            "but absent from the CV. Binary evaluation only — present or absent. "
            "Do not list soft skills. Do not list anything the CV already demonstrates."
        )
    )
    rewritten_bullet_points: List[BulletPointRewrite] = Field(
        description=(
            "Targeted rewrites of the candidate's weakest existing bullet points. "
            "Each rewrite must close at least one identified keyword gap. "
            "Do not invent experience the candidate does not have. "
            "Elevate what exists — add precision, stack specificity, and measurable outcomes."
        )
    )


class MasterOutputSchema(BaseModel):
    match_score: float = Field(
        description=(
            "Overall ATS match percentage, strictly bounded 0.00–100.00. "
            "Score based on hard keyword coverage of core job requirements only. "
            "Do not inflate. A score above 80 means the CV is genuinely strong for this role."
        )
    )
    detailed_analysis: AnalysisStructure


try:
    client = genai.Client()
    logger.info("✅ Gemini SDK Client successfully initialized at module level.")
except Exception as init_err:
    logger.critical(f"Failed to initialize Gemini SDK client wrapper: {str(init_err)}")
    raise


def generate_analysis(cv_text: str, job_description: str) -> dict:
    """
    Dispatches CV text and job description to Gemini 2.5 Flash.
    Enforces Malaysian and Southeast Asian tech recruiter screening standards.
    Output is structured via Pydantic schema — no free-form text.
    """
    if not cv_text.strip() or not job_description.strip():
        raise ValueError("LLM execution boundary failed. Context payloads cannot be empty strings.")

    system_instruction = (
        "You are a Principal Engineer and Technical Recruiting Lead at a Tier-1 Southeast Asian "
        "tech company — the calibre of Grab, Sea Group (Shopee), or GoTo. "
        "You are auditing a candidate's CV against a specific job description. "
        "Your evaluation must meet the bar these companies actually screen for.\n\n"

        "RULE 1 — BINARY KEYWORD EVALUATION:\n"
        "A technical skill is either present in the CV or it is not. "
        "'Somewhat demonstrated' does not exist. Do not give partial credit. "
        "If PostgreSQL appears once in a project description, it counts. "
        "If Docker is not mentioned anywhere, it is a gap. List it.\n\n"

        "RULE 2 — STACK DIVERSITY AUDIT:\n"
        "If the candidate has built multiple projects using the identical stack "
        "(e.g., two Node.js + MongoDB REST APIs), flag this as an engineering depth gap. "
        "Recruiters at Grab and Sea Group read this as one skill built twice, not two projects. "
        "Recommend replacing the redundant project signal with architecture that demonstrates "
        "system design awareness: async queues, caching layers, containerisation, CI/CD pipelines, "
        "or polyglot service boundaries.\n\n"

        "RULE 3 — BULLET REWRITING STANDARD:\n"
        "Rewrite using the X-Y-Z formula: Accomplished [X] as measured by [Y], by doing [Z]. "
        "Every rewritten bullet must contain three elements:\n"
        "  (1) What was built or engineered — specific, not vague.\n"
        "  (2) The exact technical stack used to build it.\n"
        "  (3) A measurable outcome — latency reduction in ms, API throughput, "
        "number of users, test coverage percentage, CI pipeline time saved, cost reduced.\n"
        "If the candidate's original bullet mentions AI or automation, "
        "the rewrite must specify how it was evaluated or validated — even basic test cases count.\n\n"

        "RULE 4 — HONESTY OVER INFLATION:\n"
        "Do not invent metrics the candidate did not demonstrate. "
        "Do not use phrases like 'spearheaded robust solutions', 'team player', "
        "'passionate about technology', or any other content-free filler. "
        "If a metric looks mathematically implausible, drop it and reframe around process instead. "
        "The output must be honest enough that the candidate can defend every line in an interview.\n\n"

        "RULE 5 — SEA MARKET SIGNALS:\n"
        "Recruiters at Grab, Sea Group, GoTo, and ByteDance SG specifically screen for: "
        "type safety (TypeScript, typed Python), testing discipline (unit + integration coverage), "
        "CI/CD awareness, system design signals (async patterns, distributed components, caching), "
        "and scalability thinking. Weight these signals heavily in your gap analysis and rewrites."
    )

    prompt = f"""
Audit the candidate CV below against the job description.

Identify every hard technical keyword the job requires that the CV does not demonstrate.
Flag any stack redundancy across projects.
Rewrite the candidate's weakest bullet points using the X-Y-Z formula with explicit stack and measurable outcome.
Do not fabricate experience. Elevate what exists.

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

    except Exception as ai_err:
        logger.error({
            "message": "LLM generation failed.",
            "error": str(ai_err)
        })
        raise