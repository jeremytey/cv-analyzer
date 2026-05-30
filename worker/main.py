import os
import sys
import time
import json
import logging
import signal
from redis import Redis

# Import our production-ready modular layers via the registered workspace package path
from worker.modules.db_client import update_analysis_result
from worker.modules.pdf_extractor import extract_text_from_pdf
from worker.modules.llm_client import generate_analysis

# --- 1. Structured Logging Setup ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("worker.main")

# --- 2. Dynamic Environment Resolution ---
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
QUEUE_NAME = os.environ.get("REDIS_QUEUE_NAME", "cv_analysis_queue")

try:
    # Maintain a single long-lived Redis client connection
    redis_client = Redis.from_url(REDIS_URL, socket_timeout=60, socket_keepalive=True)
    logger.info(f"✅ Bound successfully to Redis instance. Watching target queue: '{QUEUE_NAME}'")
except Exception as redis_err:
    logger.critical(f"Failed to wire worker process to Redis queue abstraction: {str(redis_err)}")
    sys.exit(1)

# --- 3. Posix Signal Processing for Clean Shutdown Interceptions ---
keep_running = True

def handle_graceful_shutdown(signum, frame):
    global keep_running
    logger.info(f"Received termination signal ({signum}). Completing active payload phase before processing exit routine...")
    keep_running = False

signal.signal(signal.SIGINT, handle_graceful_shutdown)
signal.signal(signal.SIGTERM, handle_graceful_shutdown)

# --- 4. Main Event Loop Engine ---
def start_worker_loop():
    logger.info("🚀 Worker core actively polling via blocking BRPOP stream operations...")
    
    while keep_running:
        try:
            # Drop block timeout to 5 seconds to ensure loop reviews keep_running on container halts
            job_payload_envelope = redis_client.brpop(QUEUE_NAME, timeout=5)
            
            if not job_payload_envelope:
                continue
                
            _, raw_payload_str = job_payload_envelope
            job_data = json.loads(raw_payload_str)
            
            # FIX: Extracted keys mapped directly to the NestJS camelCase contract definitions
            job_id = job_data.get("jobId")
            file_path = job_data.get("cvPath")
            job_description = job_data.get("jobDescription")
            
            if not job_id or not file_path or not job_description:
                logger.error(f"Malformed schema dropped. Queue metadata attributes missing parameters: {job_data}")
                continue

            logger.info(f"📋 Job ID {job_id} acquired. Starting analytical processing pipeline...")
            process_job(job_id, file_path, job_description)
            
        except json.JSONDecodeError:
            logger.error("Failed to parse pulled message context. Payload text block is not clean JSON format.")
        except Exception as loop_fault:
            logger.error(f"Core execution loop encountered an unhandled exception state: {str(loop_fault)}")
            time.sleep(2) # Prevent infinite recursive log spamming during infrastructure drops
            
    logger.info("👋 Active worker shutdown process finalized. Connection pools detached.")

# --- 5. High-Insulation Task Processing Strategy ---
def process_job(job_id: str, file_path: str, job_description: str):
    try:
        # Step A: Perform document layer content compilation
        cv_text = extract_text_from_pdf(file_path)
        
        # Step B: Perform model extraction context mapping
        analysis_payload = generate_analysis(cv_text, job_description)
        
        # Step C: Write back success contract directly to the Postgres pool
        success_db_update = {
            "status": "COMPLETED",
            "match_score": analysis_payload["match_score"],
            "analysis_results": analysis_payload["analysis_results"],
            "error_message": None
        }
        update_analysis_result(job_id, success_db_update)
        logger.info(f"🏆 Job ID {job_id} completely processed and recorded successfully.")

    except (FileNotFoundError, ValueError) as validation_err:
        # Capture intentional domain violations safely without alarming system monitors
        logger.warning(f"⚠️ Job validation failure encountered on Job ID {job_id}: {str(validation_err)}")
        failure_db_update = {
            "status": "FAILED",
            "match_score": 0.0,
            "analysis_results": None,
            "error_message": str(validation_err)
        }
        update_analysis_result(job_id, failure_db_update)

    except Exception as system_err:
        # Capture critical external connection faults or runtime library crashes
        logger.error(f"💥 Critical infrastructure collapse processing Job ID {job_id}: {str(system_err)}", exc_info=True)
        error_db_update = {
            "status": "FAILED",
            "match_score": 0.0,
            "analysis_results": None,
            "error_message": "An unexpected server infrastructure error occurred during resume processing."
        }
        try:
            update_analysis_result(job_id, error_db_update)
        except Exception as db_fatal_err:
            logger.critical(f"Database sync blocked. Unable to write fallback status to tracking ID {job_id}: {str(db_fatal_err)}")


if __name__ == "__main__":
    start_worker_loop()