"""
Deterministic query planning for the PaperUWant RAG pipeline.

Phase 1 keeps planning conservative: classify intent for observability and
future routing, but keep one retrieval query so behavior stays close to the
existing endpoint.
"""

from dataclasses import dataclass


GENERAL_INTENT = "general"
COMPARE_INTENT = "compare"
DATASET_INTENT = "dataset"

GLOBAL_SIMILARITY = "global_similarity"
BALANCED_BY_PAPER = "balanced_by_paper"

COMPARE_KEYWORDS = [
    "compare",
    "contrast",
    "difference",
    "different",
    "similarity",
    "survey",
    "\u5bf9\u6bd4",
    "\u6bd4\u8f83",
    "\u533a\u522b",
    "\u5dee\u5f02",
    "\u5206\u522b",
    "\u5404\u81ea",
    "\u5171\u540c\u70b9",
]

DATASET_KEYWORDS = [
    "dataset",
    "benchmark",
    "training data",
    "evaluation data",
    "\u6570\u636e\u96c6",
    "\u57fa\u51c6",
    "\u5b9e\u9a8c\u6570\u636e",
    "\u8bc4\u6d4b\u6570\u636e",
]


@dataclass(frozen=True)
class QueryPlan:
    original_query: str
    intent: str
    retrieval_mode: str
    rewritten_queries: list[str]
    top_k: int
    paper_ids: list[str]


def classify_query(query: str) -> tuple[str, str]:
    """Classify query intent with simple keyword rules."""
    q = query.lower()
    if any(keyword in q for keyword in COMPARE_KEYWORDS):
        return COMPARE_INTENT, BALANCED_BY_PAPER
    if any(keyword in q for keyword in DATASET_KEYWORDS):
        return DATASET_INTENT, GLOBAL_SIMILARITY
    return GENERAL_INTENT, GLOBAL_SIMILARITY


def rewrite_queries(query: str, intent: str) -> list[str]:
    """
    Return retrieval queries for the current phase.

    Additional intent-specific rewrites are intentionally deferred to Phase 2
    so Phase 1 does not add embedding calls or latency.
    """
    del intent
    return [query]


def plan_query(query: str, paper_ids: list[str], top_k: int) -> QueryPlan:
    intent, retrieval_mode = classify_query(query)
    return QueryPlan(
        original_query=query,
        intent=intent,
        retrieval_mode=retrieval_mode,
        rewritten_queries=rewrite_queries(query, intent),
        top_k=top_k,
        paper_ids=paper_ids,
    )
