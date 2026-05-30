import os
import json
import logging
from typing import List
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

logger = logging.getLogger("worker.llm_client")

# 1. Define the Strict Structural Contract for Database JsonB Matching
class AnalysisStructure(BaseModel):
    suitability_summary: str = Field(
        description="A senior engineering leadership summary explaining why or why not the candidate fits."
    )
    key_strengths: List[str] = Field(
        description="Top 3 distinct technical advantages or matching capabilities found in the candidate's history."
    )
    gaps_identified: List[str] = Field(
        description="Frictions, missing tooling, or lack of depth relative to the core job description requirements."
    )
    recommended_interview_questions: List[str] = Field(
        description="3 highly specific, deep technical or behavioral questions tailored to pressure-test their identified gaps."
    )

class MasterOutputSchema(BaseModel):
    match_score: float = Field(
        description="Overall matching percentage strictly bounded between 0.00 and 100.00 based on core requirements."
    )
    detailed_analysis: AnalysisStructure


def generate_analysis(cv_text: str, job_description: str) -> dict:
    """
    Dispatches extracted CV text and target job specifications to Gemini-2.5-flash.
    Enforces a strict Pydantic output schema to guarantee clean database insertion layouts.
    
    :param cv_text: Raw string stream extracted from the candidate's PDF.
    :param job_description: Target position requirements and context.
    :return: Dict containing 'match_score' (float) and 'analysis_results' (dict).
    """
    # Defensive Context Guardrails
    if not cv_text.strip() or not job_description.strip():
        raise ValueError("LLM execution boundary failed. Context payloads cannot be empty strings.")

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("CRITICAL: GEMINI_API_KEY variable is missing from the environment configuration.")

    # Instantiate the modern SDK client wrapper
    client = genai.Client(api_key=api_key)

    system_instruction = (
        "You are an expert Executive Technical Recruiter and Principal Staff Engineer. "
        "Your task is to ruthlessly and accurately evaluate a candidate's CV text against a targeted job description. "
        "Be highly objective. Do not inflate capabilities. Grade strictly based on visible, verifiable experience."
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
    
    Calculate a realistic match score from 0.00 to 100.00 where:
    - 90.00+ means perfect architectural match, possessing almost every single requirement.
    - 70.00-89.00 means high substance capability with minor tool stack adjustments needed.
    - Below 70.00 means substantial foundational or skill frictions exist.
    """

    try:
        logger.info("Dispatching context payloads to Gemini extraction engine...")

        # 2. Fire request with native structured generation configurations
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.2,  # Low temperature forces deterministic, analytical matching
                response_mime_type="application/json",
                response_schema=MasterOutputSchema,
            ),
        )

        raw_text = response.text
        if not raw_text:
            raise RuntimeError("Gemini network transaction returned an empty response stream block.")

        # 3. Unpack string stream into structured Python dictionaries
        structured_data = json.loads(raw_text)
        
        # Standardize outer dictionary layout to match our worker's processing contract perfectly
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