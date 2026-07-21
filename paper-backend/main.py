"""
PaperUWant FastAPI backend: PDF spatial parsing and RAG service.
"""

from typing import Any, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict

from services.chat_service import ChatServiceError
from services.pdf_parser import extract_text_with_bboxes
from services.rag_pipeline import RagPipelineError, answer_question
from services.vector_store import VectorStoreError, process_and_store_chunks


app = FastAPI(title="PaperUWant Backend", version="0.1.0")

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


class BBoxBlock(BaseModel):
    text: str
    page_number: int
    bbox: list[float]


class ProcessPaperResponse(BaseModel):
    total_blocks: int
    total_pages: int
    stored_chunks: int
    blocks: list[BBoxBlock]


class ChatRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    query: str
    paper_ids: list[str]
    top_k: int = 12
    api_key: str
    base_url: Optional[str] = None
    model_name: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict[str, Any]]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/process_paper", response_model=ProcessPaperResponse)
async def process_paper(
    file: UploadFile = File(...),
    paper_id: str = Form(...),
):
    """
    Parse a PDF, generate embeddings, and store chunks in Supabase.

    Fails explicitly if embedding generation or chunk storage fails, so the
    frontend and logs do not mistake a partial parse for a complete RAG ingest.
    """
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    try:
        pdf_bytes = await file.read()
        blocks = extract_text_with_bboxes(pdf_bytes)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF parsing failed: {exc}") from exc

    if not blocks:
        raise HTTPException(status_code=422, detail="No text blocks could be extracted from this PDF")

    try:
        stored_chunks = process_and_store_chunks(paper_id, blocks)
    except VectorStoreError as exc:
        raise HTTPException(status_code=502, detail=f"Vector store failed: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Vector store failed: {exc}") from exc

    pages = {b["page_number"] for b in blocks}
    return ProcessPaperResponse(
        total_blocks=len(blocks),
        total_pages=len(pages),
        stored_chunks=stored_chunks,
        blocks=[BBoxBlock(**b) for b in blocks],
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    try:
        result = answer_question(
            query=request.query,
            paper_ids=request.paper_ids,
            top_k=request.top_k,
            api_key=request.api_key,
            base_url=request.base_url,
            model_name=request.model_name,
        )
    except RagPipelineError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except ChatServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return ChatResponse(**result)
