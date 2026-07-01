import os
import pytest
from unittest.mock import patch, MagicMock
from worker.main import process_job

@pytest.fixture
def mock_db_clients():
    with patch("worker.main.start_processing_job") as mock_start, \
         patch("worker.main.finalize_job_analysis") as mock_finalize:
        yield mock_start, mock_finalize

@patch("worker.main.extract_text_from_pdf")
@patch("worker.main.generate_analysis")
def test_process_job_cleanup_on_success(mock_gen, mock_extract, mock_db_clients):
    """Verifies that a well-formed base64 block creates, executes, completes the DB job, and deletes the file."""
    mock_start, mock_finalize = mock_db_clients
    mock_extract.return_value = "Extracted resume content"
    mock_gen.return_value = {"match_score": 90.0, "analysis_results": {"keyword_gaps": ["TypeScript"]}}
    
    valid_base64 = "JVBERi0xLjQK"  # Valid PDF signature mock sequence string
    target_job_id = "550e8400-e29b-41d4-a716-446655440000"
    expected_path = f"/tmp/{target_job_id}.pdf"
    
    process_job(target_job_id, valid_base64, "Target description")
    
    # Assert database state change execution completed properly
    mock_finalize.assert_called_once()
    args, kwargs = mock_finalize.call_args
    assert args[1]["status"] == "COMPLETED"
    assert args[1]["match_score"] == 90.0
    assert args[1]["analysis_results"]["keyword_gaps"] == ["TypeScript"]
    
    # Assert scratch storage disk space was completely reclaimed
    assert not os.path.exists(expected_path), "Storage leak: Temporary file survived a successful execution block."

def test_process_job_decode_validation_failure(mock_db_clients):
    """Verifies that corrupt base64 string handling aborts before file allocation and flags DB failure."""
    mock_start, mock_finalize = mock_db_clients
    
    corrupted_base64 = "!!!INVALID_CHARS_THAT_WILL_TRIGGER_BINASCII_ERROR!!!"
    target_job_id = "550e8400-e29b-41d4-a716-446655440001"
    expected_path = f"/tmp/{target_job_id}.pdf"
    
    process_job(target_job_id, corrupted_base64, "Target description")
    
    # Verify the failure state was successfully committed back to Postgres
    mock_finalize.assert_called_once()
    args, kwargs = mock_finalize.call_args
    assert args[1]["status"] == "FAILED"
    
    # Expected to pass because the file was never written (Validates routing, not file removal)
    assert not os.path.exists(expected_path)

@patch("worker.main.extract_text_from_pdf")
def test_process_job_cleanup_on_extraction_failure(mock_extract, mock_db_clients):
    """Proves the cleanup guarantee: creates a file on disk, throws a domain error, and forces deletion."""
    mock_start, mock_finalize = mock_db_clients
    
    # Force a domain exception after the file has been successfully written to disk
    mock_extract.side_effect = ValueError("[Tag] Extractor failed to read machine-readable characters.")
    
    valid_base64 = "JVBERi0xLjQK"
    target_job_id = "550e8400-e29b-41d4-a716-446655440002"
    expected_path = f"/tmp/{target_job_id}.pdf"
    
    process_job(target_job_id, valid_base64, "Target description")
    
    # Assert it routed to the validation exception block and updated the database status
    mock_finalize.assert_called_once()
    args, kwargs = mock_finalize.call_args
    assert args[1]["status"] == "FAILED"
    assert "[Tag]" in args[1]["error_message"]
    
    # THE CRITICAL TEST: Proves the finally block actively eliminated the file that existed on disk
    assert not os.path.exists(expected_path), "CRITICAL LEAK: Temporary file survived a domain extraction crash."