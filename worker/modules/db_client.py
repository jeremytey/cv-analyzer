import json
import os
import logging
from datetime import datetime
from psycopg2 import pool  # type: ignore

logger = logging.getLogger("worker.db_client")

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("CRITICAL: DATABASE_URL environment variable is missing from the environment configuration.")

try:
    db_pool = pool.ThreadedConnectionPool(1, 5, dsn=DATABASE_URL)
    logger.info("✅ PostgreSQL Threaded Connection Pool successfully initialized.")
except Exception as init_err:
    logger.critical(f"Failed to initialize PostgreSQL connection pool: {str(init_err)}")
    raise

def start_processing_job(job_id: str, started_at: datetime) -> bool:
    """
    Transitions the resume status to PROCESSING and timestamps exactly when the worker 
    popped the job off the Redis queue. Leaves completed_at untouched.
    """
    query = """
        UPDATE analyses
        SET 
            status = 'PROCESSING',
            started_at = %s,
            updated_at = %s
        WHERE job_id = %s;
    """
    
    conn = None
    cursor = None
    try:
        conn = db_pool.getconn()
        cursor = conn.cursor()
        
        cursor.execute(query, (started_at, started_at, job_id))
        conn.commit()
        return cursor.rowcount > 0

    except Exception as db_err:
        if conn:
            conn.rollback()
        logger.error({"message": f"Failed to transition Job {job_id} to PROCESSING", "job_id": job_id, "error": str(db_err)})
        raise db_err
    finally:
        if cursor: 
            cursor.close()
        if conn: 
            db_pool.putconn(conn)

def finalize_job_analysis(job_id: str, payload: dict) -> bool:
    """
    Saves final analysis structures or error states, updates completed_at, 
    and drains the connection back to the pool. Leaves started_at untouched.
    """
    completed_at = datetime.utcnow()
    
    status = payload.get("status", "FAILED")
    match_score = payload.get("match_score")
    analysis_results = payload.get("analysis_results")
    error_message = payload.get("error_message")

    serialized_results = json.dumps(analysis_results) if analysis_results is not None else None

    query = """
        UPDATE analyses
        SET 
            status = %s,
            match_score = %s,
            analysis_results = %s,
            error_message = %s,
            completed_at = %s,
            updated_at = %s
        WHERE job_id = %s;
    """

    conn = None
    cursor = None
    try:
        conn = db_pool.getconn()
        cursor = conn.cursor()
        
        cursor.execute(
            query, 
            (status, match_score, serialized_results, error_message, completed_at, completed_at, job_id)
        )
        
        conn.commit()
        return cursor.rowcount > 0

    except Exception as db_err:
        if conn:
            conn.rollback()
        logger.error({"message": f"Database finalization execution failed for Job {job_id}", "job_id": job_id, "error": str(db_err)})
        raise db_err
    finally:
        if cursor: 
            cursor.close()
        if conn: 
            db_pool.putconn(conn)