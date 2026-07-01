import os
import sys
import time
import json
import logging
import signal
import base64
import re
from datetime import datetime
from redis import Redis

from worker.modules.db_client import start_processing_job, finalize_job_analysis
from worker.modules.pdf_extractor import extract_text_from_pdf
from worker.modules.llm_client import generate_analysis

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("worker.main")

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
QUEUE_NAME = os.environ.get("REDIS_QUEUE_NAME", "cv_analysis_queue")

UUID_V4_REGEX = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.IGNORECASE)

try:
    redis_client = Redis.from_url(REDIS_URL, socket_timeout=60, socket_keepalive=True)
    logger.info(f"✅ Bound successfully to Redis instance. Watching target queue: '{QUEUE_NAME}'")
except Exception as redis_err:
    logger.critical(f"Failed to wire worker process to Redis: {str(redis_err)}")
    sys.exit(1)

keep_running = True

def handle_graceful_shutdown(signum, frame):
    global keep_running
    logger.info(f"Received signal {signum}. Shutting down after current job...")
    keep_running = False

signal.signal(signal.SIGINT, handle_graceful_shutdown)
signal.signal(signal.SIGTERM, handle_graceful_shutdown)

def start_worker_loop():
    logger.info("🚀 Worker core actively polling via blocking BRPOP stream operations...")
    while keep_running:
        try:
            job_payload_envelope = redis_client.brpop(QUEUE_NAME, timeout=5)
            if not job_payload_envelope:
                continue
            _, raw_payload_str = job_payload_envelope
            job_data = json.loads(raw_payload_str)

            job_id = job_data.get("jobId")
            base64_pdf = job_data.get("base64Pdf")
            job_description = job_data.get("jobDescription")

            if not job_id or not base64_pdf or not job_description:
                # REDACTED: Log only structural existence markers to protect Render standard out storage capacity
                logger.error(
                    f"Malformed job packet dropped at transport boundary. "
                    f"Metadata: [jobId={bool(job_id)}, base64Pdf={bool(base64_pdf)}, jobDescription={bool(job_description)}]"
                )
                continue

            if not UUID_V4_REGEX.match(str(job_id)):
                logger.error(f"Security Alert: Blocked job payload with non-UUID token formatting: {job_id}")
                continue

            logger.info(f"📋 Job ID {job_id} acquired from queue layer.")
            process_job(job_id, base64_pdf, job_description)

        except json.JSONDecodeError:
            logger.error("Failed to parse queue message. Not valid JSON.")
        except Exception as loop_fault:
            logger.error(f"Loop exception: {str(loop_fault)}")
            time.sleep(2)

    logger.info("👋 Worker shutdown complete.")

def process_job(job_id: str, base64_pdf: str, job_description: str):
    temp_file_path = f"/tmp/{job_id}.pdf"
    
    try:
        started_at = datetime.utcnow()
        start_processing_job(job_id, started_at)
        logger.info(f"⚡ Job ID {job_id} transitioned to PROCESSING state.")

        # FIX A: Enforce validate=True to guarantee binascii.Error trips immediately on corrupt content characters
        pdf_bytes = base64.b64decode(base64_pdf, validate=True)
        with open(temp_file_path, "wb") as temp_file:
            temp_file.write(pdf_bytes)

        cv_text = extract_text_from_pdf(temp_file_path)
        analysis_payload = generate_analysis(cv_text, job_description)

        finalize_job_analysis(job_id, {
            "status": "COMPLETED",
            "match_score": analysis_payload["match_score"],
            "analysis_results": analysis_payload["analysis_results"],
            "error_message": None
        })
        logger.info(f"🏆 Job ID {job_id} processing successfully completed.")

    except (FileNotFoundError, ValueError) as validation_err:
        logger.warning(f"⚠️ Validation failure on Job ID {job_id}: {str(validation_err)}")
        try:
            finalize_job_analysis(job_id, {
                "status": "FAILED",
                "match_score": 0.0,
                "analysis_results": None,
                "error_message": str(validation_err)
            })
        except Exception as db_err:
            logger.error(f"Failed to record validation error state for job {job_id}: {str(db_err)}")

    except Exception as system_err:
        logger.error(f"💥 System failure on Job ID {job_id}: {str(system_err)}", exc_info=True)
        try:
            finalize_job_analysis(job_id, {
                "status": "FAILED",
                "match_score": 0.0,
                "analysis_results": None,
                "error_message": "[Internal Pipeline Error] An unhandled engineering runtime exception occurred within the processing pipeline."
            })
        except Exception as db_fatal_err:
            logger.critical(f"Cannot write failure state for Job {job_id}: {str(db_fatal_err)}")
            
    finally:
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
                logger.info(f"Cleaned up temporary file reference: {temp_file_path}")
            except Exception as cleanup_err:
                logger.error(f"Leak Warning: Failed to evict {temp_file_path} from scratch storage: {str(cleanup_err)}")

if __name__ == "__main__":
    start_worker_loop()