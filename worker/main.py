import logging
from datetime import datetime
from worker.modules.pdf_parser import extract_text_from_pdf
from worker.modules.llm_client import generate_analysis
# FIX: Updated top-level imports to pull the explicit lifecycle operations
from worker.modules.db_client import start_processing_job, finalize_job_analysis

logger = logging.getLogger("worker.main")

def process_job(job_id: str, file_path: str, job_description: str):
    try:
        # Step 0: Record startedAt timestamp cleanly
        started_at = datetime.utcnow()
        start_processing_job(job_id, started_at)
        logger.info(f"⚡ Job ID {job_id} transitioned to PROCESSING state.")

        # Step A: Perform document layer content compilation
        cv_text = extract_text_from_pdf(file_path)
        
        # Step B: Perform model extraction context mapping
        analysis_payload = generate_analysis(cv_text, job_description)
        
        # Step C: Write back success contract
        success_db_update = {
            "status": "COMPLETED",
            "match_score": analysis_payload["match_score"],
            "analysis_results": analysis_payload["analysis_results"],
            "error_message": None
        }
        finalize_job_analysis(job_id, success_db_update)
        logger.info(f"🏆 Job ID {job_id} completely processed and recorded successfully.")

    except (FileNotFoundError, ValueError) as validation_err:
        logger.warning(f"⚠️ Job validation failure encountered on Job ID {job_id}: {str(validation_err)}")
        failure_db_update = {
            "status": "FAILED",
            "match_score": 0.0,
            "analysis_results": None,
            "error_message": str(validation_err)
        }
        finalize_job_analysis(job_id, failure_db_update)

    except Exception as system_err:
        logger.error(f"💥 Critical infrastructure collapse processing Job ID {job_id}: {str(system_err)}", exc_info=True)
        error_db_update = {
            "status": "FAILED",
            "match_score": 0.0,
            "analysis_results": None,
            "error_message": "An unexpected server infrastructure error occurred during resume processing."
        }
        try:
            finalize_job_analysis(job_id, error_db_update)
        except Exception as db_fatal_err:
            logger.critical(f"Database sync blocked: {str(db_fatal_err)}")