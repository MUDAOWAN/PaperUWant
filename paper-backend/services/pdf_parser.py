"""
PyMuPDF-based PDF spatial text extractor.
Returns a list of text blocks, each with its content, page number,
and bounding box coordinates [x0, y0, x1, y1].
"""

from typing import Any
import fitz  # PyMuPDF


def _clean_pdf_text(text: str) -> str:
    """Remove control characters that PostgreSQL text fields cannot store."""
    return "".join(
        ch
        for ch in text
        if ch in ("\n", "\r", "\t") or ord(ch) >= 32
    ).strip()


def extract_text_with_bboxes(file_path_or_bytes: str | bytes) -> list[dict[str, Any]]:
    """
    Parse a PDF and extract text blocks with their physical bounding boxes.

    Args:
        file_path_or_bytes: Path to a PDF file on disk, or raw PDF bytes.

    Returns:
        A list of dicts, each containing:
            - text (str): the extracted text content
            - page_number (int): 1-indexed page number
            - bbox (list[float]): [x0, y0, x1, y1] coordinates on the page
    """
    # Open the PDF document
    if isinstance(file_path_or_bytes, str):
        doc = fitz.open(file_path_or_bytes)
    else:
        doc = fitz.open(stream=file_path_or_bytes, filetype="pdf")

    blocks: list[dict[str, Any]] = []

    for page_num in range(doc.page_count):
        page = doc[page_num]

        # "blocks" returns a list of text blocks with bbox info.
        # Each block is a tuple: (x0, y0, x1, y1, text, block_no, block_type)
        text_blocks = page.get_text("blocks")

        for block in text_blocks:
            x0, y0, x1, y1, text, _, block_type = block

            # block_type 0 = text, 1 = image, 2 = "container"
            # We only care about actual text blocks with non-empty content
            clean_text = _clean_pdf_text(text)
            if block_type == 0 and clean_text:
                blocks.append({
                    "text": clean_text,
                    "page_number": page_num + 1,   # 1-indexed
                    "bbox": [x0, y0, x1, y1],
                })

    doc.close()
    return blocks
