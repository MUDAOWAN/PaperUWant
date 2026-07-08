# PaperUWant RAG Optimization TODO

Last updated: 2026-07-07

This document records the agreed RAG optimization direction for PaperUWant and gives the next Codex session enough context to split tasks and execute them.

## Current Project Context

PaperUWant is an AI research-paper reading assistant.

Current stack:

- Frontend: Next.js, React, TypeScript, Zustand, Supabase JS, react-pdf.
- Active backend: `paper-backend`, not the older `backend` scaffold.
- Backend stack: FastAPI, PyMuPDF, Supabase Python client.
- Embedding: MiniMax `embo-01`, expected dimension 1536.
- Vector storage: Supabase `paper_chunks.embedding vector(1536)`.
- Retrieval RPC: `match_paper_chunks`.
- Final answer model: user-provided OpenAI-compatible `api_key`, `base_url`, and `model_name`.
- PDF location: Supabase Storage bucket `PaperUWant_PDFS`.

Current core flow:

1. Frontend uploads PDF to Supabase Storage.
2. Frontend inserts a row into `papers`.
3. Frontend calls `paper-backend` `/api/process_paper`.
4. Backend parses PDF text and bbox with PyMuPDF.
5. Backend cleans extracted text, embeds chunks with MiniMax, and writes `paper_chunks`.
6. User selects context papers and asks a question.
7. Backend embeds the query, calls Supabase retrieval RPC, then calls the user's OpenAI-compatible model.
8. Frontend renders citations and highlights PDF bbox evidence.

Recent important fixes:

- RAG answer generation no longer uses a hardcoded MiniMax chat model; MiniMax remains only for embeddings.
- Backend now returns explicit errors when selected papers have no stored chunks.
- PDF text cleaning removes PostgreSQL-incompatible control characters such as `\u0000`.
- PDF viewer uses local `pdfjs-dist` worker instead of `unpkg.com`.
- Re-clicking the currently open paper no longer clears `currentPdfUrl`.
- `docs/issue-resolution-log.md` records the issues fixed during this session.

Recent unresolved finding:

- Multi-paper citation targeting is still unreliable when retrieved sources do not include `paper_id`.
- Reproduction on 2026-07-07:
  - Select OpenGS and Open3DIS as context papers.
  - Keep Open3DIS open in the PDF viewer.
  - Ask a question about OpenGS.
  - Click a citation in the answer.
  - Observed: the citation highlights Open3DIS.
  - Expected: the citation switches to OpenGS and highlights the OpenGS evidence bbox.
- Likely cause:
  - The live Supabase `match_paper_chunks` RPC may still be returning rows without `paper_id`.
  - The frontend citation click path falls back to `currentPaper.id` when `src.paper_id` is missing.
  - That fallback is only safe for single-paper chat and is wrong for multi-paper chat.
- This must be fixed before judging multi-paper answer quality, because citation routing and retrieval quality are currently tangled together.

## Agreed Architecture Decisions

### Multi-document Retrieval

Use intent-adaptive retrieval.

- General questions: global similarity retrieval across selected papers.
- Compare, contrast, survey, and multi-paper reasoning questions: balanced recall per selected paper.

Implementation principle:

```python
if intent in ["compare", "contrast", "multi_paper_summary"]:
    retrieval_mode = "balanced_by_paper"
else:
    retrieval_mode = "global_similarity"
```

### Keyword Search

Accepted.

Use Supabase/Postgres keyword retrieval first, preferably with `tsvector`, rather than adding a separate search service in the first optimization pass.

### Reranker

Create an abstraction first and keep it disabled by default.

Planned behavior:

- Phase 1: `NoopReranker`.
- Phase 2: enable only for complex intents such as compare, dataset, method, and experiment questions.
- Candidate implementations:
  - BGE reranker, local or hosted.
  - Cohere Rerank API.
  - User-model based reranking only as a fallback because it is slower and consumes chat-model quota.

### Context Compression

Build a lightweight PaperUWant-specific module.

Borrow ideas from LangChain Contextual Compression Retriever and LlamaIndex Node Postprocessors, but do not introduce the whole framework yet.

Start with rule-based compression:

- Remove reference and noise chunks.
- Deduplicate chunks.
- Allocate context budget per paper for comparison tasks.
- Trim each chunk to the most relevant evidence sentences.
- Preserve `paper_id`, `page_number`, `bbox`, and original source identity.

Later optional upgrade:

- LLM-based evidence extraction or summarization.

### Chunking Strategy

Use a staged path:

1. First implement lightweight adjacent block merging.
2. Later implement parent-child chunks.

This keeps bbox citation behavior stable while improving semantic context.

### Planner Strategy

Do not start with a full agent.

Use a deterministic RAG pipeline first:

```text
intent classification
-> query rewrite
-> multi-route retrieval
-> balanced recall when needed
-> optional rerank
-> context compression
-> cited answer generation
```

Later add a lightweight planner for complex tasks.

## Phase 1: Split RAG Pipeline

Goal:

Turn `/api/chat` from a linear function into an extensible pipeline without changing the database schema.

Add files:

- `paper-backend/services/rag_pipeline.py`
- `paper-backend/services/query_planner.py`
- `paper-backend/services/retrieval.py`
- `paper-backend/services/context_compressor.py`
- `paper-backend/services/reranker.py`

Modify files:

- `paper-backend/main.py`
- `paper-backend/services/chat_service.py`

Target `/api/chat` shape:

```python
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
    except ChatServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return ChatResponse(**result)
```

Expected benefit:

- Easier debugging.
- Easier future addition of query rewrite, balanced retrieval, compression, and reranking.

Estimated cost:

- No extra model calls if Phase 1 uses rule-based planner and current retrieval.
- Minimal latency change.

Status on 2026-07-07:

- Implemented:
  - `paper-backend/services/rag_pipeline.py`
  - `paper-backend/services/query_planner.py`
  - `paper-backend/services/retrieval.py`
  - `paper-backend/services/context_compressor.py`
  - `paper-backend/services/reranker.py`
- `/api/chat` now calls `answer_question(...)`.
- `search_chunks()` now keeps `id` and `similarity` when the RPC returns them.
- Validation passed:
  - `paper-backend`: Python compile check.
  - `frontend`: `npx.cmd tsc --noEmit`.

Immediate Phase 1.5: citation identity integrity:

Goal:

- Make every citation source carry trustworthy identity before optimizing answer quality.

Backend tasks:

1. Verify live Supabase RPC `match_paper_chunks` returns:
   - `id`
   - `paper_id`
   - `content`
   - `metadata`
   - `similarity`
2. Apply `supabase/migrations/202607070001_match_paper_chunks_returns_paper_id.sql` if live RPC still omits `paper_id`.
3. Add retrieval diagnostics in `paper-backend/services/retrieval.py` or `chat_service.py`:
   - selected paper count
   - returned source count
   - source count missing `paper_id`
   - per-paper source counts
4. Keep the current single-paper fallback only as a compatibility path.

Frontend tasks:

1. Update citation click behavior:
   - If `src.paper_id` exists, switch/highlight that paper.
   - If only one context paper exists, single-paper fallback may use that paper.
   - If multiple context papers exist and `src.paper_id` is missing, do not use `currentPaper.id`; show a diagnostic.
2. Optionally show paper name near citation debug logs during development.

Expected behavior:

- Multi-paper citations route to the correct PDF regardless of which PDF is currently open.
- Missing source identity becomes visible immediately instead of silently highlighting the wrong paper.
- Later retrieval changes can be evaluated with reliable citation clicks.

## Phase 2: Intent Classification and Query Rewrite

Goal:

Improve recall for dataset, method, experiment, and comparison questions.

Implement in:

- `paper-backend/services/query_planner.py`

Initial rule-based classification:

```python
COMPARE_KEYWORDS = [
    "compare", "contrast", "difference", "different",
    "共同点", "区别", "差异", "比较", "分别", "各自",
]

DATASET_KEYWORDS = [
    "dataset", "benchmark", "数据集", "实验数据", "评测数据",
]

def classify_query(query: str) -> dict:
    q = query.lower()
    if any(k in q for k in COMPARE_KEYWORDS):
        return {"intent": "compare", "retrieval_mode": "balanced_by_paper"}
    if any(k in q for k in DATASET_KEYWORDS):
        return {"intent": "dataset", "retrieval_mode": "global_similarity"}
    return {"intent": "general", "retrieval_mode": "global_similarity"}
```

Initial rule-based rewrite:

```python
def rewrite_queries(query: str, intent: str) -> list[str]:
    queries = [query]

    if intent == "dataset":
        queries.extend([
            "dataset benchmark used in experiments",
            "evaluation dataset training testing data",
            "experiments benchmark dataset results table",
        ])

    if intent == "compare":
        queries.extend([
            "main method architecture approach framework",
            "algorithm pipeline module design",
            "training strategy input output supervision",
            "experiments ablation implementation details",
        ])

    return queries
```

Expected benefit:

- Dataset and method recall: estimated +10% to +20%.
- Multi-document comparison stability: estimated +20% to +35%.

Estimated cost:

- More MiniMax embedding calls.
- Ordinary questions should stay at 1 query.
- Dataset questions can use 3 to 4 queries.
- Compare questions can use 3 to 4 queries per paper.

## Phase 3: Balanced Multi-paper Retrieval

Goal:

Prevent compare questions from retrieving evidence from only one selected paper.

Implement in:

- `paper-backend/services/retrieval.py`

Target behavior:

```python
def retrieve_for_query(query: str, paper_ids: list[str], mode: str, top_k: int) -> list[dict]:
    if mode == "balanced_by_paper":
        return retrieve_balanced(query, paper_ids, top_k)
    return retrieve_global(query, paper_ids, top_k)
```

Balanced retrieval sketch:

```python
def retrieve_balanced(query: str, paper_ids: list[str], rewritten_queries: list[str], top_k: int) -> list[dict]:
    per_paper_limit = max(4, top_k // max(len(paper_ids), 1))
    all_hits = []

    for paper_id in paper_ids:
        paper_hits = []
        for q in rewritten_queries:
            q_embedding = embed_query(q)
            paper_hits.extend(search_chunks(q_embedding, per_paper_limit * 3, [paper_id]))

        fused = rrf_fuse([paper_hits])
        all_hits.extend(fused[:per_paper_limit])

    return sort_final(all_hits)[:top_k]
```

RRF fusion:

```python
def rrf_fuse(rankings: list[list[dict]], k: int = 60) -> list[dict]:
    scores = {}

    for ranking in rankings:
        for rank, item in enumerate(ranking, start=1):
            chunk_id = item.get("id") or item["content"][:80]
            if chunk_id not in scores:
                scores[chunk_id] = {"item": item, "score": 0}
            scores[chunk_id]["score"] += 1 / (k + rank)

    return [
        {**entry["item"], "rrf_score": entry["score"]}
        for entry in sorted(scores.values(), key=lambda x: x["score"], reverse=True)
    ]
```

Important prerequisite:

- Ensure `search_chunks()` returns `id`, `paper_id`, `content`, `metadata`, and `similarity`.
- Apply or verify `supabase/migrations/202607070001_match_paper_chunks_returns_paper_id.sql`.

Expected benefit:

- Multi-paper evidence coverage: estimated +30% to +50%.
- Cross-paper citation stability: estimated +20% to +35%.

Estimated cost:

- Extra query embeddings and RPC calls.
- Expected additional latency: roughly +0.5s to +2s depending on selected paper count and query count.

Initial limits:

- Selected papers: max 5 for optimized compare mode.
- Queries per paper: max 4.
- Per-paper initial recall: 12 to 20 chunks.
- Final context chunks: 12 to 18.

## Phase 4: Rule-based Context Compression

Goal:

Increase useful evidence density and control prompt size.

Implement in:

- `paper-backend/services/context_compressor.py`

Core pipeline:

```python
def compress_context(query: str, chunks: list[dict], intent: str, paper_ids: list[str]) -> list[dict]:
    chunks = remove_noise_chunks(chunks)
    chunks = dedupe_chunks(chunks)
    chunks = trim_chunk_content(query, chunks)
    chunks = allocate_budget(chunks, intent, paper_ids)
    return chunks
```

Noise filtering:

```python
NOISE_HEADERS = [
    "references",
    "acknowledgements",
    "appendix",
    "copyright",
]
```

Evidence sentence trimming:

```python
def trim_chunk_content(query: str, chunks: list[dict]) -> list[dict]:
    query_terms = extract_terms(query)
    for chunk in chunks:
        sentences = split_sentences(chunk["content"])
        scored = sorted(
            sentences,
            key=lambda sentence: term_overlap_score(query_terms, sentence),
            reverse=True,
        )
        chunk["content"] = " ".join(scored[:3])[:1200]
    return chunks
```

Comparison budget:

```python
def allocate_budget(chunks: list[dict], intent: str, paper_ids: list[str]) -> list[dict]:
    if intent != "compare":
        return chunks[:18]

    grouped = group_by_paper(chunks)
    selected = []

    for paper_id in paper_ids:
        selected.extend(grouped.get(paper_id, [])[:4])

    remaining = [chunk for chunk in chunks if chunk not in selected]
    selected.extend(remaining[:8])
    return selected[:20]
```

Rules:

- Compression may trim `content`.
- Compression must not drop source identity.
- Preserve `paper_id`, `page_number`, `bbox`, `id`, and scores.
- Do not let the LLM invent new source ids.

Expected benefit:

- Context density: estimated +25% to +45%.
- Prompt size: estimated -30% to -60%.
- Multi-document answer stability: estimated +15% to +30%.

Estimated cost:

- Rule-based compression latency should be under 100ms.
- No extra API cost.

## Phase 5: Supabase Keyword Retrieval

Goal:

Improve exact-term retrieval for dataset names, method names, metrics, and benchmark names.

Add migration:

- `supabase/migrations/<timestamp>_paper_chunks_keyword_search.sql`

Suggested SQL:

```sql
alter table public.paper_chunks
add column if not exists content_tsv tsvector
generated always as (
  to_tsvector('english', coalesce(content, ''))
) stored;

create index if not exists paper_chunks_content_tsv_idx
on public.paper_chunks using gin(content_tsv);

create or replace function public.keyword_match_paper_chunks(
  query_text text,
  match_count int,
  p_paper_ids uuid[] default null
)
returns table (
  id uuid,
  paper_id uuid,
  content text,
  metadata jsonb,
  keyword_score real
)
language sql
stable
security invoker
as $$
  select
    pc.id,
    pc.paper_id,
    pc.content,
    pc.metadata,
    ts_rank(pc.content_tsv, plainto_tsquery('english', query_text)) as keyword_score
  from public.paper_chunks pc
  where
    (p_paper_ids is null or pc.paper_id = any(p_paper_ids))
    and pc.content_tsv @@ plainto_tsquery('english', query_text)
  order by keyword_score desc
  limit match_count;
$$;
```

Add file:

- `paper-backend/services/keyword_search.py`

Fuse vector and keyword results with RRF:

```python
vector_hits = vector_search(query)
keyword_hits = keyword_search(query)
fused = rrf_fuse([vector_hits, keyword_hits])
```

Expected benefit:

- Dataset, method, metric, and benchmark questions: estimated +20% to +40%.
- Citation hit precision: estimated +10% to +25%.

Estimated cost:

- Additional database query per rewritten query.
- Extra database index storage.
- Does not consume Supabase Storage PDF quota.

## Phase 6: Reranker Interface

Goal:

Prepare reranking without forcing immediate paid API usage.

Add file:

- `paper-backend/services/reranker.py`

Initial interface:

```python
class BaseReranker:
    def rerank(self, query: str, chunks: list[dict], top_n: int) -> list[dict]:
        return chunks[:top_n]


class NoopReranker(BaseReranker):
    pass
```

Future providers:

- `BGEReranker`
- `CohereReranker`
- `UserModelListwiseReranker`

Suggested config:

```text
RERANKER_PROVIDER=none
RERANK_ON_INTENTS=compare,dataset,method
RERANK_TOP_N=12
```

Expected benefit once enabled:

- Citation precision: estimated +20% to +40%.
- Complex question answer quality: estimated +15% to +30%.

Estimated cost:

- `none`: no added cost.
- Cohere: paid API usage and about +0.5s to +2s.
- BGE local: no per-call API cost, but requires CPU/GPU/RAM and deployment work.

## Phase 7: Adjacent Block Merging

Goal:

Improve chunk semantic completeness without moving directly to parent-child chunking.

Add file:

- `paper-backend/services/chunking.py`

Target logic:

```python
def merge_adjacent_blocks(blocks: list[dict], max_chars: int = 1200) -> list[dict]:
    merged = []
    current = None

    for block in blocks:
        if should_merge(current, block, max_chars):
            current["text"] += "\n" + block["text"]
            current["bboxes"].append(block["bbox"])
            current["block_indices"].append(block["block_index"])
        else:
            if current:
                merged.append(current)
            current = new_chunk(block)

    if current:
        merged.append(current)

    return merged
```

Metadata target:

```json
{
  "page_number": 3,
  "bboxes": [[0, 0, 100, 20], [0, 22, 100, 45]],
  "block_indices": [12, 13],
  "section_hint": "method"
}
```

Frontend note:

- Initially highlight the first bbox.
- Later support multi-bbox highlight.

Expected benefit:

- Context completeness: estimated +15% to +25%.
- Answer fluency: estimated +10% to +20%.

Estimated cost:

- Chunk count may decrease, so embedding cost may decrease.
- Frontend highlight becomes slightly more complex if multi-bbox support is added.

## Phase 8: Parent-child Chunks

Goal:

Support high-recall child retrieval while providing larger parent context to the LLM.

Add migration:

- `paper_chunk_groups`
- `paper_chunks.parent_id`

Suggested table:

```sql
create table public.paper_chunk_groups (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.papers(id) on delete cascade,
  content text not null,
  summary text,
  section_hint text,
  page_start int,
  page_end int,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

alter table public.paper_chunks
add column if not exists parent_id uuid references public.paper_chunk_groups(id);
```

Target behavior:

- Retrieve using child chunk embedding.
- Build LLM context using child evidence plus parent summary or parent window.
- Cite child chunk bbox.

Expected benefit:

- Complex paper understanding: estimated +20% to +35%.
- Multi-paper comparison quality: estimated +15% to +30%.

Estimated cost:

- More database text storage.
- More processing complexity.

## Phase 9: Lightweight Planner

Goal:

Handle complex academic tasks without introducing a full agent early.

Planner output shape:

```json
{
  "task_type": "compare",
  "papers_required": "all_selected",
  "aspects": ["method", "dataset", "metrics"],
  "retrieval_mode": "balanced_by_paper",
  "needs_rerank": true,
  "context_budget": "large"
}
```

Implementation options:

- Rule-based first.
- Optional LLM planner later.

Expected benefit:

- Complex task quality: estimated +25% to +50%.

Estimated cost:

- If LLM planner is used, one extra LLM call and about +0.5s to +2s.

## Recommended Next Execution Order

Implement in this order:

1. Phase 1: split RAG pipeline. Completed on 2026-07-07.
2. Phase 1.5: citation identity integrity.
   - Apply/verify RPC returns `paper_id`.
   - Add backend retrieval diagnostics.
   - Remove unsafe multi-paper frontend fallback to `currentPaper.id`.
3. Phase 2: intent classification and query rewrite.
4. Phase 3: balanced multi-paper retrieval.
5. Phase 4: rule-based context compression.
6. Make sure `search_chunks()` returns `id`, `paper_id`, and `similarity`.
7. Phase 5: Supabase keyword retrieval.
8. Phase 6: reranker interface, disabled by default.
9. Phase 7: adjacent block merging.
10. Phase 8: parent-child chunks.
11. Phase 9: lightweight planner.

## Validation Checklist

After each RAG change, test:

1. Single-paper dataset question:
   - Example: "What dataset does this paper use?"
   - Expected: answer includes citations and sources have `paper_id`, `page_number`, and `bbox`.
2. Multi-paper comparison:
   - Example: "Compare these two papers' methods."
   - Expected: sources include evidence from each selected paper.
3. No-chunks paper:
   - Expected: backend returns a clear diagnostic instead of sending empty context to the LLM.
4. Citation click:
   - Expected: clicking citation switches to the correct paper and highlights the source bbox.
5. Context size:
   - Expected: context sent to the final chat model stays under the configured budget.

Additional multi-paper citation test:

1. Select OpenGS and Open3DIS as context papers.
2. Open Open3DIS in the PDF viewer.
3. Ask a question specifically about OpenGS.
4. Click each citation in the OpenGS answer.
5. Expected:
   - The viewer switches to OpenGS for OpenGS sources.
   - The highlighted bbox appears on the cited OpenGS page.
   - The console/backend diagnostics show non-null `paper_id` for each source.
6. Repeat in the opposite direction:
   - Keep OpenGS open.
   - Ask about Open3DIS.
   - Citations should switch to Open3DIS.

## New Conversation Handoff Prompt

Use the following prompt in a new Codex conversation:

```text
You are taking over PaperUWant development.

Please first read and follow these project documents:

- docs/project-status.md
- docs/local-chain-check.md
- docs/supabase-checklist.md
- docs/issue-resolution-log.md
- docs/rag-optimization-todo.md

Project summary:

PaperUWant is an AI research-paper reading assistant. The frontend is in `frontend` and uses Next.js, React, TypeScript, Zustand, Supabase JS, and react-pdf. The active backend is `paper-backend`, not the older `backend` scaffold. The backend uses FastAPI, PyMuPDF, Supabase Python client, and MiniMax embeddings. MiniMax is used only for embeddings. Final RAG answers use the user's OpenAI-compatible `api_key`, `base_url`, and `model_name` from the frontend settings.

Current RAG flow:

1. Frontend uploads PDF to Supabase Storage bucket `PaperUWant_PDFS`.
2. Frontend inserts a row into `papers`.
3. Frontend calls `paper-backend` `/api/process_paper`.
4. Backend parses PDF text and bbox with PyMuPDF, cleans text, embeds chunks with MiniMax, and inserts `paper_chunks`.
5. Frontend calls `paper-backend` `/api/chat` with selected `paper_ids`, query, and user model settings.
6. Backend embeds the query, calls Supabase retrieval RPC, builds cited context, calls the user model, and returns answer plus sources.
7. Frontend renders citations and highlights PDF bbox evidence.

Important current decisions:

- Multi-document retrieval should be intent-adaptive.
  - General questions use global similarity retrieval.
  - Compare or survey questions use balanced recall per selected paper.
- Keyword retrieval is accepted and should use Supabase/Postgres first.
- Reranker should be implemented as an abstraction first and disabled by default.
- Context compression should be a lightweight PaperUWant-specific module inspired by LangChain/LlamaIndex postprocessor ideas, not a full framework migration.
- Chunking should evolve from current PyMuPDF blocks to adjacent block merging first, then parent-child chunks later.
- Do not start with a full agent. First build a stable, observable RAG pipeline.

Recommended next task:

Start with Phase 1 in `docs/rag-optimization-todo.md`:

- Add `paper-backend/services/rag_pipeline.py`
- Add `paper-backend/services/query_planner.py`
- Add `paper-backend/services/retrieval.py`
- Add `paper-backend/services/context_compressor.py`
- Add `paper-backend/services/reranker.py`
- Refactor `/api/chat` in `paper-backend/main.py` to call `answer_question(...)`.

Constraints and cautions:

- Do not expose backend Supabase secret keys to the frontend.
- `frontend/.env.local` may only contain public Supabase frontend variables.
- `paper-backend/.env` contains server-only Supabase and MiniMax values.
- Use `npm.cmd` instead of `npm` in PowerShell.
- Preserve existing user changes. Do not revert unrelated work.
- Keep citation metadata intact: `paper_id`, `page_number`, `bbox`, chunk id, and scores.
- After changes, run:
  - `paper-backend`: Python compile check.
  - `frontend`: `npx.cmd tsc --noEmit`.

Please begin by reading the docs above, then propose a short implementation plan for Phase 1 and execute it unless a blocker is found.
```
