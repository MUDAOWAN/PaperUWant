"""
End-to-end RAG pipeline orchestration for PaperUWant.
"""

from typing import Any

from services.chat_service import generate_answer
from services.context_compressor import compress_context
from services.query_planner import plan_query
from services.reranker import get_reranker
from services.retrieval import RetrievalResultError, retrieve_contexts


class RagPipelineError(RuntimeError):
    """Raised for request-level RAG states that map to specific HTTP codes."""

    def __init__(self, message: str, *, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


def answer_question(
    *,
    query: str,
    paper_ids: list[str],
    top_k: int,
    api_key: str,
    base_url: str | None,
    model_name: str,
) -> dict[str, Any]:
    """
    Plan, retrieve, optionally rerank/compress, and answer with citations.
    """
    if not paper_ids:
        raise RagPipelineError(
            "At least one paper_id is required for RAG chat",
            status_code=400,
        )

    plan = plan_query(query, paper_ids, top_k)
    print(
        "[RAG] "
        f"intent={plan.intent} mode={plan.retrieval_mode} "
        f"papers={len(plan.paper_ids)} top_k={plan.top_k}"
    )

    try:
        contexts = retrieve_contexts(plan)
    except RetrievalResultError as exc:
        raise RagPipelineError(str(exc), status_code=exc.status_code) from exc

    reranker = get_reranker()
    reranked_contexts = reranker.rerank(query, contexts, top_n=top_k)
    compressed_contexts = compress_context(
        query,
        reranked_contexts,
        intent=plan.intent,
        paper_ids=paper_ids,
    )

    return generate_answer(
        query,
        compressed_contexts,
        api_key=api_key,
        base_url=base_url,
        model_name=model_name,
    )
