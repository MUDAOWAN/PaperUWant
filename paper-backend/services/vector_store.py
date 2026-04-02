"""
Vector store: MiniMax embedding API → Supabase paper_chunks table.
"""

import json
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import httpx
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

# ── Clients (lazy init) ───────────────────────────────────────────────────────
def _get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in .env")
    return create_client(url, key)


# ── MiniMax embedding ──────────────────────────────────────────────────────────
EMBEDDING_MODEL = "embo-01"
BATCH_SIZE = 50


def _fetch_embedding_batch(texts: list[str]) -> list[list[float]]:
    """
    Call MiniMax embeddings API for a batch of texts (max 50 per request).
    NEVER returns None — returns [] on any failure.
    """
    api_key = os.getenv("MINIMAX_API_KEY", "").strip()
    group_id = os.getenv("MINIMAX_GROUP_ID", "").strip()
    if not api_key:
        print("❌ [MiniMax] MINIMAX_API_KEY not set in .env")
        return []
    if not group_id:
        print("❌ [MiniMax] MINIMAX_GROUP_ID not set in .env")
        return []

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
    print(f"📡 [Debug] Sending to MiniMax: {payload}")

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, headers=headers, json=payload)

        raw_text = response.text
        print(f"📡 [MiniMax] status={response.status_code} body={raw_text[:800]}")

        # 只解析一次 JSON
        resp_json = response.json()

        # MiniMax returns { "vectors": [[...], [...]] } — a 2-D array aligned with input texts
        if "vectors" in resp_json:
            return resp_json["vectors"]
        else:
            print(f"❌ [MiniMax API Error] 接口未返回 vectors! 原始响应: {raw_text}")
            return []

    except httpx.HTTPStatusError as e:
        print(f"❌ [MiniMax HTTP Error] {e.response.status_code} — 原始响应: {e.response.text}")
        return []
    except Exception as e:
        print(f"❌ [MiniMax Network Exception] 请求 MiniMax 失败: {str(e)}")
        return []


# ── Chunk processing & upsert ─────────────────────────────────────────────────
def process_and_store_chunks(
    paper_id: str,
    blocks: list[dict[str, Any]],
    *,
    executor: ThreadPoolExecutor | None = None,
) -> int:
    """
    1. Slice blocks into batches of BATCH_SIZE.
    2. Call MiniMax embeddings API for each batch (parallelised via ThreadPool).
    3. Build row records (paper_id, content, embedding, metadata).
    4. Batch-insert into Supabase `paper_chunks`.

    Returns the total number of chunks successfully stored.
    """
    if not blocks:
        return 0

    # ── Step 1: gather all texts in order ─────────────────────────────────────
    texts = [b["text"] for b in blocks]

    # ── Step 2: batch-embed (ThreadPool for true parallelism) ─────────────────
    batches: list[list[str]] = [
        texts[i : i + BATCH_SIZE] for i in range(0, len(texts), BATCH_SIZE)
    ]

    def embed_batch(batch: list[str]) -> list[list[float]]:
        return _fetch_embedding_batch(batch)

    if executor is None:
        executor = ThreadPoolExecutor(max_workers=4)

    # Run all batches concurrently — each returns a list of vectors
    batch_vectors: list[list[list[float]]] = list(
        executor.map(embed_batch, batches)
    )

    # Flatten into one vector per block, preserving original order
    all_embeddings: list[list[float]] = []
    for batch_idx, batch_vecs in enumerate(batch_vectors):
        # 防御性校验：跳过空或长度不匹配的批次，绝不让程序崩溃
        if not batch_vecs or len(batch_vecs) != len(batches[batch_idx]):
            print(f"⚠️ [Warning] 跳过第 {batch_idx} 批 (获取到 {len(batch_vecs) if batch_vecs else 0} 个向量，期望 {len(batches[batch_idx])} 个)")
            continue
        all_embeddings.extend(batch_vecs)

    # 如果所有批次全失败，直接中止入库
    if not all_embeddings:
        print("⚠️ [Warning] 所有批次向量获取均失败，跳过入库")
        return 0

    # ── Step 3: build records ─────────────────────────────────────────────────
    records: list[dict[str, Any]] = []
    for block, embedding in zip(blocks, all_embeddings, strict=True):
        records.append({
            "paper_id": paper_id,
            "content": block["text"],
            "embedding": embedding,
            "metadata": json.dumps({
                "page_number": block["page_number"],
                "bbox": block["bbox"],
            }),
        })

    # ── Step 4: batch insert ─────────────────────────────────────────────────
    supabase = _get_supabase()
    response = (
        supabase.table("paper_chunks")
        .insert(records)
        .execute()
    )

    if hasattr(response, "data"):
        return len(response.data)
    # Supabase-py 2.x: error raised on failure; reach here only on partial insert
    return len(records)
