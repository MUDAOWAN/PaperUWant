# PaperUWant Project Status

Last updated: 2026-07-07

Related docs:

- `docs/supabase-checklist.md`
- `docs/local-chain-check.md`

## One-line Summary

PaperUWant is a lightweight AI research-paper knowledge base and reading assistant for uploading PDFs, reading in browser, selecting text, taking notes, asking questions, and locating cited evidence in papers.

## Current Architecture

### Frontend

- Directory: `frontend`
- Stack: Next.js 16, React 19, TypeScript, Zustand, react-pdf, Tiptap, AI SDK, Supabase JS.
- Main UI: `frontend/src/app/page.tsx`
- Supabase client: `frontend/src/lib/supabase.ts`
- Backend API client: `frontend/src/lib/api.ts`
- State stores:
  - `frontend/src/store/authStore.ts`
  - `frontend/src/store/paperStore.ts`

### Backend A: `backend`

This appears to be an early/basic FastAPI backend shell.

- Directory: `backend`
- Stack: FastAPI, Supabase Python client.
- Current endpoints:
  - `/`
  - `/api/health`
  - `/chat/`
  - `/pdf/list`
- Role today: mostly placeholder. It checks Supabase config but does not implement the current PDF parsing or RAG flow.
- Env sample: `backend/.env.example`
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`

### Backend B: `paper-backend`

This is the current PDF processing and RAG backend.

- Directory: `paper-backend`
- Stack: FastAPI, PyMuPDF, Supabase Python client, MiniMax API.
- Current endpoints:
  - `GET /health`
  - `POST /api/process_paper`
  - `POST /api/chat`
- Role today:
  - Receive uploaded PDF from frontend.
  - Parse PDF text blocks and page coordinates.
  - Generate embeddings.
  - Store chunks into Supabase `paper_chunks`.
  - Retrieve chunks through Supabase RPC `match_paper_chunks`.
  - Generate cited answers through MiniMax.
- Env sample: `paper-backend/.env.example`
  - Matches the variables read by `paper-backend`: `SUPABASE_URL`, `SUPABASE_KEY`, `MINIMAX_API_KEY`, `MINIMAX_GROUP_ID`.

## Backend Difference

`backend` and `paper-backend` are not equivalent.

- `backend` is a general API scaffold. It has basic routing, config loading, and placeholder chat/PDF routes.
- `paper-backend` is the real document intelligence service currently used by the frontend through `frontend/src/lib/api.ts`.
- The frontend hardcodes FastAPI base URL as `http://localhost:8001`, and calls:
  - `POST /api/process_paper`
  - `POST /api/chat`
- Those routes exist in `paper-backend`, not in `backend`.

Recommended direction: keep `paper-backend` as the active backend for now, then later either merge its logic into `backend` or rename it clearly to avoid confusion.

## Supabase Usage

### Frontend Variables

Used in `frontend/src/lib/supabase.ts`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### `backend` Variables

Used in `backend/core/config.py`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

### `paper-backend` Variables

Used in `paper-backend/services/vector_store.py` and `paper-backend/services/chat_service.py`:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `MINIMAX_API_KEY`
- `MINIMAX_GROUP_ID`

### Storage Bucket

The frontend uses Supabase Storage bucket:

- `PaperUWant_PDFS`

Current file path pattern:

- `{user_id}/{safe_file_name}.pdf`

Observed in Supabase dashboard on 2026-07-06:

- Bucket exists: `PaperUWant_PDFS`
- Bucket visibility: public
- File size limit: unset in dashboard, shown as 50 MB effective limit
- Allowed MIME types: any
- Storage policies count shown in dashboard: 4

### Tables Referenced By Code

Known from code:

- `papers`
  - Used for uploaded paper records.
  - Fields referenced: `id`, `file_name`, `storage_path`, `user_id`, `folder_id`, `is_pinned`, `created_at`.
- `folders`
  - Used for user folders.
  - Fields referenced: `id`, `name`, `user_id`, `created_at`.
- `paper_chunks`
  - Used by RAG.
  - Fields inserted: `paper_id`, `content`, `embedding`, `metadata`.
- RPC/function:
  - `match_paper_chunks`
  - Parameters used: `query_embedding`, `match_threshold`, `match_count`, `p_paper_ids`.

Observed in Supabase dashboard on 2026-07-06:

- Existing tables:
  - `papers`
  - `folders`
  - `paper_chunks`
  - `chats`
  - `messages`
- `papers` visible columns:
  - `id uuid`
  - `user_id uuid`
  - `file_name text`
  - `storage_path text`
  - `created_at timestamptz`
  - `folder_id uuid`
  - `is_pinned bool`
- `folders` visible columns:
  - `id uuid`
  - `user_id uuid`
  - `name text`
  - `created_at timestamptz`
- `paper_chunks` visible columns:
  - `id uuid`
  - `paper_id uuid`
  - `content text`
  - `embedding vector`
  - `metadata jsonb`
  - `created_at timestamptz`
- `chats` visible columns:
  - `id uuid`
  - `user_id uuid`
  - `paper_id uuid`
  - `created_at timestamptz`
- `messages` visible columns:
  - `id uuid`
  - `chat_id uuid`
  - `role text`
  - `content text`
  - `created_at timestamptz`

Local Supabase migration coverage is starting but incomplete:

- `supabase/migrations/202607070001_match_paper_chunks_returns_paper_id.sql` defines `match_paper_chunks` with `paper_id` in the returned table so citation sources can target the correct paper.
- The remaining cloud schema should still be exported or recreated locally as SQL.

## Core Flow

1. User signs in through Supabase Auth.
2. User uploads one or more PDF files from the frontend.
3. Frontend uploads PDF files to Supabase Storage bucket `PaperUWant_PDFS`.
4. Frontend inserts a row into `papers` with file name, storage path, and user id.
5. Frontend asynchronously calls `paper-backend` `/api/process_paper` with the original browser `File` and the new `paper_id`.
6. `paper-backend` parses PDF text blocks with PyMuPDF.
7. `paper-backend` generates embeddings through MiniMax and inserts rows into `paper_chunks`.
8. User asks a question with selected context papers.
9. Frontend calls `paper-backend` `/api/chat`.
10. `paper-backend` embeds the query, calls Supabase RPC `match_paper_chunks`, then calls MiniMax chat and returns answer plus sources.
11. Frontend renders answer citations and can highlight the source area in the PDF viewer using `page_number` and `bbox`.

## Current Progress

### Handoff Summary 2026-07-07

- Local services were tested with `paper-backend` on `127.0.0.1:8001` and frontend on `127.0.0.1:3000`.
- Supabase Storage upload, `papers` insert, PDF parsing, MiniMax embedding, and `paper_chunks` insert are confirmed working after MiniMax balance was restored.
- Test paper id: `0e6f3d04-0766-45da-af71-686a217e307d`.
- That paper has 244 rows in `paper_chunks`.
- Backend RAG `/api/chat` can retrieve chunks and return answer sources with `page_number` and `bbox`.
- Known RAG source issue: `sources.paper_id` is currently `null`, likely because Supabase RPC `match_paper_chunks` does not return `paper_id`.
- Frontend chat ordering bug was fixed by assigning a monotonic display order to normal AI messages and RAG messages before rendering.
- RAG answer model routing was changed:
  - MiniMax remains the embedding provider.
  - Final RAG answer generation now uses the user's OpenAI-compatible settings from the frontend (`api_key`, `base_url`, `model_name`).
  - This replaced the previous hardcoded MiniMax chat model for final RAG answers.
- Checks passed after changes:
  - `paper-backend` Python compile/import checks.
  - `frontend` `npx.cmd tsc --noEmit`.
- Existing `npm.cmd run lint` failures remain and are not caused solely by the latest changes.

### Completed

- Supabase Auth integration in frontend.
- Cloud PDF upload to Supabase Storage.
- `papers` table insert after upload.
- Cloud paper list loading.
- Folder creation, rename, deletion, and paper movement.
- Signed URL generation for reading PDFs.
- PDF viewer with text selection.
- Basic smart notes editor UI.
- RAG chat UI with selected context papers.
- Citation click-to-highlight path using `page_number` and `bbox`.
- PyMuPDF parser for text blocks and bounding boxes.
- Embedding and chunk insert code for `paper_chunks`.
- RAG query code using Supabase RPC and MiniMax chat.

### Partially Completed

- Upload-to-processing flow exists, but processing result is not persisted as a status.
- Parsing extracts text blocks, page numbers, and bounding boxes, but not paper metadata.
- Notes editor exists, but notes are not persisted to Supabase.
- RAG flow exists in code, but depends on missing local database schema/RPC files.
- Frontend has both general chat via AI SDK and paper RAG chat via `paper-backend`; behavior should be clarified.

### Not Yet Completed

- Local database migration files.
- Storage bucket setup documentation.
- Table schema documentation.
- Processing status fields such as `queued`, `processing`, `completed`, `failed`.
- Processing progress display in frontend.
- Structured metadata extraction: title, authors, year, abstract, page count.
- Page-level storage such as `paper_pages`.
- Notes/highlights database persistence.
- Retry and recovery flow for failed PDF processing.
- Unified backend structure.
- Clean README for project setup and operation.

### Unknown

- The existing Supabase tables appear to have been manually created in the cloud project.
- `paper_chunks.embedding` is confirmed as `vector(1536)`. It still needs to be checked against the actual MiniMax embedding response length.
- `match_paper_chunks` exists in Supabase and is shown as security invoker.
- RLS is enabled for `chats`, `folders`, `messages`, `paper_chunks`, and `papers`; policies are visible for most tables, but `paper_chunks` has no policy rows.
- Whether the Storage bucket `PaperUWant_PDFS` policies match the app's expected user-scoped file access.

## Current Issues

### Supabase Sleep Or Pause

If the Supabase project is paused or unavailable, these features may fail:

- User login and session refresh.
- Fetching `papers` and `folders`.
- Uploading to Storage.
- Creating signed URLs for PDF viewing.
- Inserting rows into `papers`.
- Inserting rows into `paper_chunks`.
- Calling RPC `match_paper_chunks`.
- Deleting papers or files.

After Supabase is restored, retest:

1. Login.
2. Load cloud paper list.
3. Upload a small PDF.
4. Confirm Storage file exists.
5. Confirm `papers` row exists.
6. Confirm `paper_chunks` rows exist after processing.
7. Open the uploaded PDF.
8. Ask a question and check citations.

### Environment Variable Mismatch

`paper-backend/.env.example` does not match code expectations.

Code reads:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `MINIMAX_API_KEY`
- `MINIMAX_GROUP_ID`

The sample now matches the variables read by the backend service.

### Missing Database Schema

Only one local SQL migration exists so far. This improves the immediate RAG citation issue, but the project still needs full schema coverage to be recreated reliably or debugged easily.

Priority schemas still to document or create:

- `papers`
- `folders`
- `paper_chunks`
- `match_paper_chunks` overloads and current deployed definition
- Storage bucket `PaperUWant_PDFS`

Later schemas:

- `paper_pages`
- `paper_notes`
- `paper_highlights`
- `paper_processing_jobs`

### Upload Processing Visibility

The frontend currently treats upload success and parsing success separately:

- Upload success is shown to the user.
- PDF processing is called asynchronously.
- Processing failure only appears in the browser console.

This means a paper may appear in the library but not be ready for RAG.

### `paper_chunks` Access Path

`paper_chunks` has RLS enabled and no visible table policies. Since `paper-backend` inserts chunks after PDF parsing and `match_paper_chunks` is security invoker, this table must be writable/readable by the backend's Supabase key or have suitable policies for the chosen backend access model. The preferred short-term path is to keep chunk operations in `paper-backend` with a server-only key.

### MiniMax Embedding Blocker

Direct MiniMax embedding testing on 2026-07-06 reached the API but returned `vectors: null` with `base_resp.status_msg` equal to `insufficient balance`. This explains why PDF parsing can succeed while `paper_chunks` remains empty. The account balance/quota must be restored or the embedding provider changed. The backend should also expose this failure clearly instead of returning a successful PDF parse response with zero stored chunks.

Backend status after fix:

- `paper-backend` now treats vector storage failure as an explicit processing failure.
- MiniMax API errors, missing vectors, vector dimension mismatch, and Supabase chunk insert failures now raise readable backend errors.
- `POST /api/process_paper` returns HTTP 502 for vector storage failures.
- Successful processing responses now include `stored_chunks`.

After MiniMax balance was restored, the test PDF processed successfully:

- MiniMax embedding returned 1536-dimensional vectors.
- `POST /api/process_paper` stored 244 chunks.
- Supabase `paper_chunks` confirmed 244 rows for the tested paper id.

RAG model routing update:

- MiniMax remains the embedding provider for query and document vectors.
- The final RAG answer model now uses the user's OpenAI-compatible settings from the frontend:
  - API key
  - base URL
  - model name
- This prevents selected-paper RAG answers from being generated by the hardcoded MiniMax chat model when the user configured a GPT-compatible model.

### Metadata Extraction Gap

Current parser returns:

- `text`
- `page_number`
- `bbox`

It does not yet extract:

- title
- authors
- year
- abstract
- page count as a stored field
- DOI or venue

## Recommended Next Steps

1. Apply and verify the `match_paper_chunks` migration in Supabase.
2. Create Supabase migration SQL files for the remaining existing tables and bucket setup.
3. Align `.env.example` files with code.
4. Add a clear root README with setup order.
5. Add processing status fields to `papers`.
6. Update `paper-backend` to mark processing states in Supabase.
7. Update frontend to show processing state after upload.
8. Add structured PDF metadata extraction.
9. Decide whether to merge `paper-backend` into `backend`.
10. Add minimal test checklist for upload, parse, chunk write, and RAG answer.
11. Persist notes and highlights after the core upload/RAG flow is stable.

## Open Questions

- Should `SUPABASE_KEY` in `paper-backend` be the service role key or anon key?
- Should `backend` be removed, merged, or kept for future general API routes?
- What embedding dimension does MiniMax `embo-01` return in the current account?
- Should notes be global per paper, per user, or per selected text range?
- Does Supabase already contain RPC/function `match_paper_chunks`?
- What exact policies exist for `papers`, `folders`, `paper_chunks`, `chats`, `messages`, and bucket `PaperUWant_PDFS`?
