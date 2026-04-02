"""
PaperUWant FastAPI backend — PDF spatial parsing service.
"""

from fastapi import FastAPI, Form, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from typing import Any

from pydantic import BaseModel

from services.pdf_parser import extract_text_with_bboxes
from services.vector_store import process_and_store_chunks
from services.chat_service import generate_answer, search_chunks, _fetch_query_embedding


# ── App init ──────────────────────────────────────────────────────────────────
app = FastAPI(title="PaperUWant Backend", version="0.1.0")

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Schemas ───────────────────────────────────────────────────────────────────
class BBoxBlock(BaseModel):
    text: str
    page_number: int
    bbox: list[float]


class ProcessPaperResponse(BaseModel):
    total_blocks: int
    total_pages: int
    blocks: list[BBoxBlock]


class ChatRequest(BaseModel):
    query: str
    paper_ids: list[str]
    top_k: int = 5


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict[str, Any]]


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health() -> dict:
    """Smoke-test endpoint."""
    return {"status": "ok"}


@app.post("/api/process_paper", response_model=ProcessPaperResponse)
async def process_paper(
    file: UploadFile = File(...),
    paper_id: str = Form(...),
):
    """
    Accept an uploaded PDF, extract text blocks with bounding-box
    coordinates, embed them via MiniMax, and store in Supabase.
    """
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    try:
        pdf_bytes = await file.read()
        blocks = extract_text_with_bboxes(pdf_bytes)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF parsing failed: {exc}")

    if not blocks:
        raise HTTPException(status_code=422, detail="No text blocks could be extracted from this PDF")

    # Embed & store chunks in Supabase (non-blocking within this handler)
    try:
        stored = process_and_store_chunks(paper_id, blocks)
        print(f"[process_paper] Stored {stored} chunks for paper {paper_id}")
    except Exception as exc:
        # Log but do not fail — PDF parse result is still returned
        print(f"[process_paper] Vector store error (non-fatal): {exc}")

    pages = {b["page_number"] for b in blocks}

    return ProcessPaperResponse(
        total_blocks=len(blocks),
        total_pages=len(pages),
        blocks=[BBoxBlock(**b) for b in blocks],
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    RAG-powered chat endpoint:
    1. Embed the query.
    2. Search Supabase for relevant chunks across multiple papers.
    3. Call MiniMax chat model with enriched context.
    """
    query_embedding = _fetch_query_embedding(request.query)
    if query_embedding is None:
        raise HTTPException(status_code=500, detail="Failed to embed query")

    contexts = search_chunks(query_embedding, request.top_k, request.paper_ids)
    result = generate_answer(request.query, contexts)
    return ChatResponse(**result)
