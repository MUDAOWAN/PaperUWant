"""
RAG chat service.

MiniMax is still used for query embeddings because stored paper_chunks were
created with the same embedding model. The final answer is generated through
the user's OpenAI-compatible chat API configuration from the frontend.
"""

import json
import os
import re
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

EMBEDDING_MODEL = "embo-01"
DEFAULT_CHAT_BASE_URL = "https://api.openai.com/v1"


class ChatServiceError(RuntimeError):
    """Raised when RAG query embedding, search, or answer generation fails."""


def _get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_KEY", "").strip()
    if not url or not key:
        raise ChatServiceError("SUPABASE_URL and SUPABASE_KEY must be set in .env")
    return create_client(url, key)


def _fetch_query_embedding(query: str) -> Optional[list[float]]:
    """Embed a query string using MiniMax embedding API."""
    api_key = os.getenv("MINIMAX_API_KEY", "").strip()
    group_id = os.getenv("MINIMAX_GROUP_ID", "").strip()
    if not api_key or not group_id:
        print("[-] MINIMAX_API_KEY or MINIMAX_GROUP_ID not set")
        return None

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": EMBEDDING_MODEL,
        "texts": [query],
        "type": "query",
    }
    url = f"https://api.minimax.chat/v1/embeddings?GroupId={group_id}"

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, headers=headers, json=payload)

        resp_json = response.json()
        base_resp = resp_json.get("base_resp") or {}
        status_code = base_resp.get("status_code")
        status_msg = base_resp.get("status_msg")
        if status_code not in (None, 0):
            print(f"[-] MiniMax query embedding error {status_code}: {status_msg}")
            return None

        vectors = resp_json.get("vectors")
        if response.status_code == 200 and isinstance(vectors, list) and vectors:
            return vectors[0]
        print(f"[-] _fetch_query_embedding failed: {response.text[:500]}")
        return None
    except Exception as e:
        print(f"[-] _fetch_query_embedding exception: {str(e)}")
        return None


def search_chunks(query_embedding: list[float], top_k: int, paper_ids: list[str]) -> list[dict[str, Any]]:
    """
    Search Supabase paper_chunks via RPC for multi-paper RAG.
    Returns a list of dicts with content and metadata.
    """
    supabase = _get_supabase()
    try:
        resp = supabase.rpc(
            "match_paper_chunks",
            {
                "query_embedding": query_embedding,
                "match_threshold": 0.15,
                "match_count": top_k,
                "p_paper_ids": paper_ids,
            },
        ).execute()
    except Exception as exc:
        raise ChatServiceError(f"Supabase match_paper_chunks failed: {exc}") from exc

    if hasattr(resp, "data") and resp.data:
        contexts: list[dict[str, Any]] = []
        for row in resp.data:
            metadata = (
                json.loads(row["metadata"])
                if isinstance(row["metadata"], str)
                else row["metadata"]
            )
            paper_id = row.get("paper_id")
            if not paper_id and isinstance(metadata, dict):
                paper_id = metadata.get("paper_id")
            if not paper_id and len(paper_ids) == 1:
                paper_id = paper_ids[0]
            if not paper_id:
                print(
                    "[-] match_paper_chunks returned a source without paper_id; "
                    "update the Supabase RPC before relying on multi-paper citations"
                )

            contexts.append(
                {
                    "id": row.get("id"),
                    "content": row["content"],
                    "paper_id": paper_id,
                    "metadata": metadata,
                    "similarity": row.get("similarity"),
                }
            )
        return contexts
    return []


def has_stored_chunks(paper_ids: list[str]) -> bool:
    """Return whether any selected paper has stored chunks for RAG."""
    if not paper_ids:
        return False

    supabase = _get_supabase()
    try:
        resp = (
            supabase.table("paper_chunks")
            .select("id")
            .in_("paper_id", paper_ids)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise ChatServiceError(f"Supabase paper_chunks status check failed: {exc}") from exc

    return bool(getattr(resp, "data", None))


def _build_rag_messages(query: str, contexts: list[dict[str, Any]]) -> list[dict[str, str]]:
    formatted_contexts = ""
    if contexts:
        lines = []
        for i, ctx in enumerate(contexts, start=1):
            lines.append(f"[{i}] {ctx['content'].strip()}")
        formatted_contexts = "\n".join(lines)

    max_context_len = 30_000
    if len(formatted_contexts) > max_context_len:
        formatted_contexts = (
            formatted_contexts[:max_context_len]
            + "\n[...context truncated because it exceeded the request budget...]"
        )

    system_message = (
        "You are an academic reading assistant. Answer using the provided paper "
        "context when it is relevant. When you use a source sentence, cite it "
        "with the corresponding marker like [1] or [2]. If the provided context "
        "does not contain enough information, say so clearly."
    )
    user_message = (
        "Retrieved paper context:\n"
        f"{formatted_contexts or '[No relevant context retrieved]'}\n\n"
        "Question:\n"
        f"{query}"
    )
    return [
        {"role": "system", "content": system_message},
        {"role": "user", "content": user_message},
    ]


def _normalise_chat_base_url(base_url: Optional[str]) -> str:
    clean_base_url = (base_url or "").strip().rstrip("/")
    return clean_base_url or DEFAULT_CHAT_BASE_URL


def generate_answer(
    query: str,
    contexts: list[dict[str, Any]],
    *,
    api_key: str,
    base_url: Optional[str],
    model_name: str,
) -> dict[str, Any]:
    """
    Call the user's OpenAI-compatible chat API with RAG context.
    Returns {"answer": "...", "sources": [...]} for the frontend.
    """
    if not api_key.strip():
        raise ChatServiceError("Chat API key is required for RAG answers")
    if not model_name.strip():
        raise ChatServiceError("Chat model name is required for RAG answers")

    clean_base_url = _normalise_chat_base_url(base_url)
    url = f"{clean_base_url}/chat/completions"
    messages = _build_rag_messages(query, contexts)
    payload = {
        "model": model_name.strip(),
        "messages": messages,
    }
    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "Content-Type": "application/json",
    }

    last_msg = payload["messages"][-1]
    print("\n========== [RAG Chat] Outgoing Payload ==========")
    print(f"[Model] {payload['model']} | [URL] {url}")
    print(f"[Chars] {len(last_msg['content'])}")
    print("================================================\n")

    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(url, headers=headers, json=payload)
    except httpx.RequestError as exc:
        raise ChatServiceError(f"Chat API request failed: {exc}") from exc

    raw_text = response.text
    if response.status_code >= 400:
        raise ChatServiceError(f"Chat API HTTP {response.status_code}: {raw_text[:500]}")

    try:
        resp_json = response.json()
    except ValueError as exc:
        raise ChatServiceError(f"Chat API returned non-JSON response: {raw_text[:500]}") from exc

    if resp_json.get("error"):
        err_detail = json.dumps(resp_json.get("error"), ensure_ascii=False)
        raise ChatServiceError(f"Chat API returned error: {err_detail[:500]}")

    choices = resp_json.get("choices")
    if not choices:
        raise ChatServiceError(f"Chat API returned no choices: {raw_text[:500]}")

    raw_answer = choices[0].get("message", {}).get("content", "")
    clean_answer = re.sub(r"<think>[\s\S]*?</think>\s*", "", raw_answer).strip()
    if not clean_answer:
        raise ChatServiceError(f"Chat API returned empty answer: {raw_text[:500]}")

    return {
        "answer": clean_answer,
        "sources": contexts,
    }
