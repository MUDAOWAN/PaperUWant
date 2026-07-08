"""
Lightweight context post-processing for PaperUWant RAG.

Phase 1 is intentionally a no-op wrapper so source identity and answer behavior
remain stable while the pipeline gets a dedicated compression stage.
"""

from typing import Any


def compress_context(
    query: str,
    chunks: list[dict[str, Any]],
    *,
    intent: str,
    paper_ids: list[str],
) -> list[dict[str, Any]]:
    """Return chunks unchanged for Phase 1."""
    del query, intent, paper_ids
    return chunks
