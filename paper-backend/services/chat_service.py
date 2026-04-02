"""
Chat service: MiniMax chat API for RAG-powered Q&A.
"""

import json
import os
import re
from typing import Any

import httpx
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

CHAT_MODEL = "minimax-m2.7"
CHAT_URL = "https://api.minimax.chat/v1/chat/completions"
EMBEDDING_MODEL = "embo-01"


def _get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in .env")
    return create_client(url, key)


def _fetch_query_embedding(query: str) -> list[float] | None:
    """Embed a query string using MiniMax embedding API."""
    api_key = os.getenv("MINIMAX_API_KEY", "").strip()
    group_id = os.getenv("MINIMAX_GROUP_ID", "").strip()
    if not api_key or not group_id:
        print("❌ [_fetch_query_embedding] MINIMAX_API_KEY or MINIMAX_GROUP_ID not set")
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
        if response.status_code == 200 and "vectors" in resp_json:
            return resp_json["vectors"][0]
        print(f"❌ [_fetch_query_embedding] 原始响应: {response.text[:500]}")
        return None
    except Exception as e:
        print(f"❌ [_fetch_query_embedding] 请求失败: {str(e)}")
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
                "match_threshold": 0.3,
                "match_count": top_k,
                "p_paper_ids": paper_ids,
            },
        ).execute()

        if hasattr(resp, "data") and resp.data:
            return [
                {
                    "content": row["content"],
                    "metadata": json.loads(row["metadata"])
                        if isinstance(row["metadata"], str)
                        else row["metadata"],
                }
                for row in resp.data
            ]
        return []
    except Exception as e:
        print(f"❌ [search_chunks] RPC 调用失败: {str(e)}")
        return []


def generate_answer(query: str, contexts: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Call MiniMax chat API with RAG-enhanced prompt.
    Returns {"answer": "...", "sources": [...]} for the frontend.
    `contexts` is a list of dicts with "content" and "metadata" keys.
    """
    api_key = os.getenv("MINIMAX_API_KEY", "").strip()
    group_id = os.getenv("MINIMAX_GROUP_ID", "").strip()
    if not api_key or not group_id:
        print("❌ [Chat] MINIMAX_API_KEY or MINIMAX_GROUP_ID not set in .env")
        return {"answer": "服务配置错误，请联系管理员。", "sources": []}

    # Build formatted contexts string with [1], [2], ... citation markers
    formatted_contexts = ""
    if contexts:
        lines = []
        for i, ctx in enumerate(contexts, start=1):
            lines.append(f"[{i}] {ctx['content'].strip()}")
        formatted_contexts = "\n".join(lines)

    system_message = (
        "你是一个智能学术助手。请遵循以下规则：\n"
        "1. 如果用户提问与学术、文献有关，请严格依据下面 User 提供的 [参考资料] 作答。在引用资料中的句子后，务必加上对应的引用标记，如 [1]、[2]。若资料中没提及，请诚实说明。\n"
        "2. 如果用户进行日常寒暄，请忽略参考资料，以友好的口吻正常交流。"
    )

    user_message = (
        f"以下是系统检索到的 [参考资料]：\n"
        f"{formatted_contexts}\n\n"
        f"请根据上述资料，回答我的问题：\n"
        f"{query}"
    )

    messages = [
        {"role": "system", "content": system_message},
        {"role": "user", "content": user_message},
    ]

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": CHAT_MODEL,
        "messages": messages,
    }
    url = f"{CHAT_URL}?GroupId={group_id}"

    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(url, headers=headers, json=payload)

        raw_text = response.text
        print(f"📡 [Chat] status={response.status_code} body={raw_text[:800]}")

        resp_json = response.json()

        # Parse MiniMax chat response
        if response.status_code == 200 and "choices" in resp_json:
            choice = resp_json["choices"][0]
            if "message" in choice:
                raw_answer = choice["message"].get("content", "")
                # Strip <think>...</think> chains from the answer
                clean_answer = re.sub(r'<think>[\s\S]*?</think>\s*', '', raw_answer)
                return {
                    "answer": clean_answer,
                    "sources": contexts,
                }

        # Fallback: return raw error
        print(f"❌ [Chat API Error] 原始响应: {raw_text}")
        return {
            "answer": f"抱歉，模型返回了异常响应：{raw_text[:200]}",
            "sources": contexts,
        }

    except httpx.HTTPStatusError as e:
        print(f"❌ [Chat HTTP Error] {e.response.status_code} — 原始响应: {e.response.text}")
        return {"answer": f"请求失败：{e.response.status_code}", "sources": []}
    except Exception as e:
        print(f"❌ [Chat Network Exception] 调用 MiniMax Chat 失败: {str(e)}")
        return {"answer": f"网络错误：{str(e)}", "sources": []}
