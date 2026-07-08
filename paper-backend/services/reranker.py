"""
Reranker abstraction for PaperUWant RAG.

The default provider is disabled. Future providers can implement the same
interface without changing the rest of the RAG pipeline.
"""

from typing import Any


class BaseReranker:
    def rerank(
        self,
        query: str,
        chunks: list[dict[str, Any]],
        *,
        top_n: int | None = None,
    ) -> list[dict[str, Any]]:
        limit = top_n if top_n is not None else len(chunks)
        return chunks[:limit]


class NoopReranker(BaseReranker):
    """Default reranker that preserves retrieval order."""


def get_reranker() -> BaseReranker:
    return NoopReranker()
