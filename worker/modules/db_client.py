import os
import logging
import threading
from psycopg_pool import ConnectionPool

logger = logging.getLogger("worker.db_client")

# Threading primitives to ensure safe instantiation in concurrent environments
_pool_lock = threading.Lock()
_db_pool = None

def get_pool() -> ConnectionPool:
    """
    Thread-safe lazy initializer for the PostgreSQL connection pool.
    Defers environment parsing and socket binding past import collection time.
    """
    global _db_pool
    
    # Fast path: pool is already wired and healthy
    if _db_pool is not None:
        return _db_pool
        
    with _pool_lock:
        # Double-checked locking pattern to prevent race conditions
        if _db_pool is None:
            database_url = os.environ.get("DATABASE_URL")
            if not database_url:
                logger.critical("CRITICAL ENVIRONMENT ERROR: 'DATABASE_URL' variable is missing from runtime context.")
                raise ValueError("DATABASE_URL environment variable must be populated before invoking the database layer.")
            
            try:
                logger.info("Initializing connection pool pool layer (Deferred Connection Mode)...")
                _db_pool = ConnectionPool(
                    conninfo=database_url,
                    min_size=2,
                    max_size=10,
                    open=True
                )
                logger.info("✅ PostgreSQL Connection Pool instantiated cleanly.")
            except Exception as pool_err:
                logger.critical(f"Failed to instantiate connection pool footprint: {str(pool_err)}")
                raise
                
    return _db_pool

def start_processing_job(job_id: str, started_at):
    """Transitions a tracking job state marker to PROCESSING."""
    pool = get_pool()
    query = """
        UPDATE analyses
        SET status = 'PROCESSING', started_at = %s, updated_at = NOW()
        WHERE job_id = %s;
    """
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, (started_at, job_id))

def finalize_job_analysis(job_id: str, payload: dict):
    """Commits the finalized LLM assessment output metrics back to the tracking row."""
    pool = get_pool()
    query = """
        UPDATE analyses
        SET status = %s, 
            match_score = %s, 
            analysis_results = %s, 
            error_message = %s, 
            completed_at = NOW(), 
            updated_at = NOW()
        WHERE job_id = %s;
    """
    # Import json cleanly to serialize dictionaries into the native Postgres JSONB column format
    import json
    results_json = json.dumps(payload["analysis_results"]) if payload["analysis_results"] else None
    
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, (
                payload["status"],
                payload["match_score"],
                results_json,
                payload["error_message"],
                job_id
            ))