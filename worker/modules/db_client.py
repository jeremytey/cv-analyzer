# db interaction module for worker processes, utilizing a persistent threaded connection pool for efficient database operations.
import json
import os
import logging
from datetime import datetime
from psycopg2 import pool  # type: ignore

# Initialize structured logging module configuration
logger = logging.getLogger("worker.db_client")

# 1. Establish a Single Persistent Threaded Connection Pool at boot time
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("CRITICAL: DATABASE_URL environment variable is missing from the environment configuration.")

try:
    # Maintain a minimum of 1 idle connection and scale to a maximum of 5 active connections per worker process
    db_pool = pool.ThreadedConnectionPool(1, 5, dsn=DATABASE_URL)
    logger.info("✅ PostgreSQL Threaded Connection Pool successfully initialized.")
except Exception as init_err:
    logger.critical(f"Failed to initialize PostgreSQL connection pool: {str(init_err)}")
    raise

def update_analysis_result(job_id: str, payload: dict) -> bool:
    """
    Borrows a connection from the persistent pool to save final analysis results.
    Propagates exceptions upward to ensure processing failures are never silently swallowed.
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
        # 2. Borrow an active connection stream from the pre-warmed pool
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
        
        # Log with explicit structural severity levels instead of raw un-indexed strings
        logger.error({
            "message": f"Database transaction execution failed for Job {job_id}",
            "job_id": job_id,
            "error": str(db_err)
        })
        # Reraise the exception so the orchestrator knows the state update failed
        raise db_err
        
    finally:
        # 3. Always return the connection back to the pool rather than severing the socket
        if cursor:
            cursor.close()
        if conn:
            db_pool.putconn(conn)