import os
import json
import logging
from typing import List
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

logger = logging.getLogger("worker.llm_client")

# --- 1. True Feature Schema Alignment (Fixes Issue 3) ---
class BulletPointRewrite(BaseModel):
    original: str = Field(
        description="The original weak or unoptimized bullet point extracted from the candidate's CV."
    )
    rewritten: str = Field(
        description="The upgraded bullet point embedded with clear metrics, action verbs, and missing target keywords."
    )
    justification: str = Field(
        description="1-sentence explanation of why this change makes the candidate more competitive for this role."
    )

class AnalysisStructure(BaseModel):
    keyword_gaps: List[str] = Field(
        description="Specific critical hard tools, frameworks, concepts, or methodologies required by the job but missing from the CV."
    )
    rewritten_bullet_points: List[BulletPointRewrite] = Field(
        description="A list of targeted optimizations for their existing experience bullets to explicitly close the identified gaps."
    )

class MasterOutputSchema(BaseModel):
    match_score: float = Field(
        description="Overall matching percentage strictly bounded between 0.00 and 100.00 based on core requirements."
    )
    detailed_analysis: AnalysisStructure


# --- 2. Single Global Initialization (Correct Module Scope Lifecycle) ---
try:
    client = genai.Client()
    logger.info("✅ Gemini SDK Client successfully initialized at module level.")
except Exception as init_err:
    logger.critical(f"Failed to initialize Gemini SDK client wrapper: {str(init_err)}")
    raise


def generate_analysis(cv_text: str, job_description: str) -> dict:
    """
    Dispatches extracted CV text and target job specifications to Gemini-2.5-flash.
    Enforces the exact feature contract schema required by the core application spec.
    """
    if not cv_text.strip() or not job_description.strip():
        raise ValueError("LLM execution boundary failed. Context payloads cannot be empty strings.")

    system_instruction = (
        "You are an expert Executive Technical Recruiter and Principal Staff Engineer. "
        "Your job is to run a brutal gap analysis on a CV against a target job description. "
        "Identify precise technical keyword gaps and provide high-impact, metrics-driven bullet point rewrites "
        "that showcase the candidate's capabilities using the X-Y-Z formula (Accomplished [X] as measured by [Y], by doing [Z])."
    )

    prompt = f"""
    Evaluate the following candidate CV text against the targeted Job Description requirements.
    
    ---
    TARGET JOB DESCRIPTION:
    {job_description}
    ---
    CANDIDATE CV TEXT:
    {cv_text}
    ---
    """

    try:
        logger.info("Dispatching context payloads to Gemini extraction engine...")

        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.2,
                response_mime_type="application/json",
                response_schema=MasterOutputSchema, 
            ),
        )

        raw_text = response.text
        if not raw_text:
            raise RuntimeError("Gemini network transaction returned an empty response stream block.")

        structured_data = json.loads(raw_text)
        
        return {
            "match_score": float(structured_data.get("match_score", 0.0)),
            "analysis_results": structured_data.get("detailed_analysis", {})
        }

    except Exception as ai_err:
        logger.error({
            "message": "AI Engine generation boundary collapsed during model transaction processing.",
            "error": str(ai_err)
        })
        raise