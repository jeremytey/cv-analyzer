import os
import logging
import pdfplumber

logger = logging.getLogger("worker.pdf_extractor")

def extract_text_from_pdf(file_path: str) -> str:
    """
    Reads a local PDF file from the shared volume using pdfplumber and converts 
    its structural text data layout into a continuous, clean text stream.
    
    :param file_path: Absolute disk path targeting the saved PDF file.
    :return: Sanitized string representing the compiled readable text contents.
    :raises FileNotFoundError: If the target file is missing from the volume.
    :raises ValueError: If the document is empty, too large, or lacks readable text characters.
    """
    # 1. Enforce rigorous file availability and scale boundaries upfront
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"CV parsing boundary failed. File not found at path: {file_path}")

    if not os.path.isfile(file_path):
        raise ValueError(f"Target path does not resolve to a file entity: {file_path}")

    # Enforce basic memory scale validation (skip parsing if file is artificially bloated)
    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    if file_size_mb > 15:
        raise ValueError(f"File size limit exceeded. CV is {file_size_mb:.2f}MB (Max allowed: 15MB)")

    logger.info(f"Commencing document extraction sequence via pdfplumber for: {file_path}")

    extracted_text_segments = []

    try:
        # 2. Open the PDF context manager stream safely
        with pdfplumber.open(file_path) as pdf:
            total_pages = len(pdf.pages)
            if total_pages == 0:
                raise ValueError("The targeted PDF document contains zero evaluable pages.")

            # 3. Process layout text page by page
            for index, page in enumerate(pdf.pages):
                page_text = page.extract_text(layout=False)
                
                if page_text:
                    # Basic string normalization: clean up trailing whitespaces per line
                    cleaned_page_text = "\n".join([line.strip() for line in page_text.splitlines() if line.strip()])
                    if cleaned_page_text:
                        extracted_text_segments.append(cleaned_page_text)
                else:
                    logger.debug(f"Skipped page segment indexing at page index {index}: No characters matched.")

        # 4. Compile the segments into a unified text document stream
        full_document_text = "\n\n".join(extracted_text_segments).strip()

        if not full_document_text:
            raise ValueError(
                "[Extraction Failure] No parseable text detected. This PDF appears to be a flat "
                "scanned image or contains corrupted document metadata layers."
            )

        logger.info(f"✅ Document extraction complete. Successfully processed {total_pages} pages.")
        return full_document_text

    except ValueError as validation_err:
        # Catch errors we intentionally tripped due to bad or unparseable user input context
        logger.warning({
            "message": "CV processing rejected due to document validation failure.",
            "file_path": file_path,
            "reason": str(validation_err)
        })
        raise

    except Exception as structural_err:
        # Catch actual system, OS, or core library engine crashes
        logger.error({
            "message": f"Fatal decompression or structural failure parsing PDF binary streams at path: {file_path}",
            "error": str(structural_err)
        })
        raise