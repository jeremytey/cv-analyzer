import pytest
from unittest.mock import patch, MagicMock
# Update this import path to match your exact directory tree location
from modules.pdf_extractor import extract_text_from_pdf

def test_extract_text_missing_file_throws_file_not_found():
    non_existent_path = "/app/uploads/non_existent_file.pdf"
    
    with pytest.raises(FileNotFoundError) as exc_info:
        extract_text_from_pdf(non_existent_path)
        
    assert "CV parsing boundary failed" in str(exc_info.value)


@patch("modules.pdf_extractor.os.path.exists")
@patch("modules.pdf_extractor.os.path.isfile")
def test_extract_text_directory_path_throws_value_error(mock_isfile, mock_exists, tmp_path):
    # Setup paths
    directory_path = str(tmp_path / "mock_directory")
    
    # Configure our mock doubles inside the module namespace
    mock_exists.return_value = True
    mock_isfile.return_value = False # Force it to act like a directory, not a file
    
    with pytest.raises(ValueError) as exc_info:
        extract_text_from_pdf(directory_path)
        
    assert "Target path does not resolve to a file entity" in str(exc_info.value)


@patch("modules.pdf_extractor.os.path.exists")
@patch("modules.pdf_extractor.os.path.isfile")
@patch("modules.pdf_extractor.os.path.getsize")
def test_extract_text_oversized_file_throws_value_error(mock_getsize, mock_isfile, mock_exists):
    dummy_path = "/app/uploads/bloated_cv.pdf"
    mock_exists.return_value = True
    mock_isfile.return_value = True
    # 16MB in bytes = 16 * 1024 * 1024
    mock_getsize.return_value = 16 * 1024 * 1024
    
    with pytest.raises(ValueError) as exc_info:
        extract_text_from_pdf(dummy_path)
        
    assert "File size limit exceeded" in str(exc_info.value)


@patch("modules.pdf_extractor.os.path.exists")
@patch("modules.pdf_extractor.os.path.isfile")
@patch("modules.pdf_extractor.os.path.getsize")
@patch("modules.pdf_extractor.pdfplumber.open")
def test_extract_text_empty_or_scanned_pdf_throws_value_error(
    mock_pdf_open, mock_getsize, mock_isfile, mock_exists
):
    dummy_path = "/app/uploads/scanned_image.pdf"
    mock_exists.return_value = True
    mock_isfile.return_value = True
    mock_getsize.return_value = 1 * 1024 * 1024 # 1MB nominal size
    
    # Configure pdfplumber inner structures
    mock_pdf_instance = MagicMock()
    mock_page = MagicMock()
    mock_page.extract_text.return_value = None # Simulates blank canvas scan
    mock_pdf_instance.pages = [mock_page]
    
    mock_pdf_open.return_value.__enter__.return_value = mock_pdf_instance
    
    with pytest.raises(ValueError) as exc_info:
        extract_text_from_pdf(dummy_path)
        
    assert "Failed to extract any machine-readable characters" in str(exc_info.value)