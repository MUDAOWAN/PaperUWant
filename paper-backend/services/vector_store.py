"""
Vector store: MiniMax embedding API -> Supabase paper_chunks table.
"""

import json
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import httpx
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()


class VectorStoreError(RuntimeError):
    """Raised when embedding or chunk storage fails."""


def _get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_KEY", "").strip()
    if not url or not key:
        raise VectorStoreError("SUPABASE_URL and SUPABASE_KEY must be set in .env")
    return create_client(url, key)


EMBEDDING_MODEL = "embo-01"
BATCH_SIZE = 50
EXPECTED_EMBEDDING_DIM = 1536


def _fetch_embedding_batch(texts: list[str]) -> list[list[float]]:
    """
    Call MiniMax embeddings API for a batch of texts.

    Raises:
        VectorStoreError: if credentials are missing, MiniMax rejects the request,
        the response has no vectors, or the vector shape is invalid.
    """
    api_key = os.getenv("MINIMAX_API_KEY", "").strip()
    group_id = os.getenv("MINIMAX_GROUP_ID", "").strip()
    if not api_key:
        raise VectorStoreError("MINIMAX_API_KEY is not set in .env")
    if not group_id:
        raise VectorStoreError("MINIMAX_GROUP_ID is not set in .env")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": EMBEDDING_MODEL,
        "texts": texts,
        "type": "db",
    }
    url = f"https://api.minimax.chat/v1/embeddings?GroupId={group_id}"
    print(f"[MiniMax] embedding batch size={len(texts)} model={EMBEDDING_MODEL}")

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, headers=headers, json=payload)
    except httpx.RequestError as exc:
        raise VectorStoreError(f"MiniMax embedding request failed: {exc}") from exc

    raw_text = response.text
    print(f"[MiniMax] status={response.status_code} body={raw_text[:800]}")

    if response.status_code >= 400:
        raise VectorStoreError(
            f"MiniMax embedding HTTP {response.status_code}: {raw_text[:500]}"
        )

    try:
        resp_json = response.json()
    except ValueError as exc:
        raise VectorStoreError(
            f"MiniMax returned non-JSON response: {raw_text[:500]}"
        ) from exc

    base_resp = resp_json.get("base_resp") or {}
    status_code = base_resp.get("status_code")
    status_msg = base_resp.get("status_msg")
    if status_code not in (None, 0):
        raise VectorStoreError(
            f"MiniMax embedding API error {status_code}: {status_msg or 'unknown error'}"
        )

    vectors = resp_json.get("vectors")
    if not isinstance(vectors, list):
        raise VectorStoreError(
            f"MiniMax embedding response did not contain vectors: {raw_text[:500]}"
        )
    if len(vectors) != len(texts):
        raise VectorStoreError(
            f"MiniMax returned {len(vectors)} vectors for {len(texts)} texts"
        )

    for idx, vector in enumerate(vectors):
        if not isinstance(vector, list):
            raise VectorStoreError(f"MiniMax vector #{idx} is not a list")
        if len(vector) != EXPECTED_EMBEDDING_DIM:
            raise VectorStoreError(
                f"MiniMax vector #{idx} has dimension {len(vector)}, "
                f"expected {EXPECTED_EMBEDDING_DIM}"
            )

    return vectors


def process_and_store_chunks(
    paper_id: str,
    blocks: list[dict[str, Any]],
    *,
    executor: ThreadPoolExecutor | None = None,
) -> int:
    """
    Embed parsed PDF text blocks and insert them into Supabase paper_chunks.

    Returns:
        Number of chunk rows inserted.

    Raises:
        VectorStoreError: if embedding generation or storage fails.
    """
    if not blocks:
        return 0

    texts = [b["text"] for b in blocks]
    batches: list[list[str]] = [
        texts[i : i + BATCH_SIZE] for i in range(0, len(texts), BATCH_SIZE)
    ]

    def embed_batch(batch: list[str]) -> list[list[float]]:
        return _fetch_embedding_batch(batch)

    owns_executor = executor is None
    if executor is None:
        executor = ThreadPoolExecutor(max_workers=4)

    try:
        batch_vectors: list[list[list[float]]] = list(executor.map(embed_batch, batches))
    finally:
        if owns_executor:
            executor.shutdown(wait=True)

    all_embeddings: list[list[float]] = []
    for batch_idx, batch_vecs in enumerate(batch_vectors):
        expected_count = len(batches[batch_idx])
        if len(batch_vecs) != expected_count:
            raise VectorStoreError(
                f"Embedding batch {batch_idx} returned {len(batch_vecs)} vectors, "
                f"expected {expected_count}"
            )
        all_embeddings.extend(batch_vecs)

    if len(all_embeddings) != len(blocks):
        raise VectorStoreError(
            f"Generated {len(all_embeddings)} embeddings for {len(blocks)} text blocks"
        )

    records: list[dict[str, Any]] = []
    for block, embedding in zip(blocks, all_embeddings):
        records.append(
            {
                "paper_id": paper_id,
                "content": block["text"],
                "embedding": embedding,
                "metadata": {
                    "page_number": block["page_number"],
                    "bbox": block["bbox"],
                },
            }
        )

    supabase = _get_supabase()

    try:
        response = supabase.table("paper_chunks").insert(records).execute()
    except Exception as exc:
        raise VectorStoreError(f"Supabase paper_chunks insert failed: {exc}") from exc

    if not hasattr(response, "data") or response.data is None:
        raise VectorStoreError("Supabase paper_chunks insert returned no data")

    inserted = len(response.data)
    if inserted != len(records):
        raise VectorStoreError(
            f"Supabase inserted {inserted} chunks, expected {len(records)}"
        )

    return inserted
