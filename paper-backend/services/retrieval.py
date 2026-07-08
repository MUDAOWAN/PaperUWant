"""
Retrieval layer for PaperUWant RAG.

The first pass wraps existing vector retrieval behind a small API. Later phases
can add balanced multi-paper retrieval and keyword retrieval here.
"""

from typing import Any

from services.chat_service import (
    ChatServiceError,
    _fetch_query_embedding,
    has_stored_chunks,
    search_chunks,
)
from services.query_planner import BALANCED_BY_PAPER, QueryPlan


class RetrievalResultError(ChatServiceError):
    """Raised when retrieval cannot produce usable context."""

    def __init__(self, message: str, *, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


def retrieve_contexts(plan: QueryPlan) -> list[dict[str, Any]]:
    """
    Retrieve paper chunks for a planned query.

    Balanced retrieval is intentionally routed to the existing global path for
    Phase 1. The planner still exposes the mode so the next phase can add the
    per-paper path without changing the FastAPI endpoint again.
    """
    if plan.retrieval_mode == BALANCED_BY_PAPER:
        print("[RAG] balanced retrieval planned; using Phase 1 global retrieval")

    query = plan.rewritten_queries[0] if plan.rewritten_queries else plan.original_query
    query_embedding = _fetch_query_embedding(query)
    if query_embedding is None:
        raise RetrievalResultError("Failed to embed query", status_code=500)

    contexts = search_chunks(query_embedding, plan.top_k, plan.paper_ids)
    if contexts:
        return contexts

    if not has_stored_chunks(plan.paper_ids):
        raise RetrievalResultError(
            "Selected paper has no stored chunks yet. "
            "Upload processing may still be running or may have failed.",
            status_code=409,
        )

    raise RetrievalResultError(
        "No relevant paper chunks matched this question. Try a more specific question.",
        status_code=404,
    )
