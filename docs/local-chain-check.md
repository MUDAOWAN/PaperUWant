# Local Chain Check

Last updated: 2026-07-07

This document records how to run the local PaperUWant chain and verify the upload-to-RAG flow.

## Services

### PDF/RAG Backend

Directory:

```text
paper-backend
```

Start command:

```powershell
cd D:\PaperUWant\paper-backend
.\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8001
```

Health check:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8001/health"
```

Expected result:

```text
status: ok
```

Confirmed on 2026-07-06:

- `paper-backend` Python syntax/import check passed.
- `GET /health` returned `ok`.

### Frontend

Directory:

```text
frontend
```

PowerShell note:

- `npm` may fail on Windows PowerShell if script execution is restricted.
- Use `npm.cmd` instead.

Start command:

```powershell
cd D:\PaperUWant\frontend
npm.cmd run dev
```

Open:

```text
http://localhost:3000
```

Confirmed on 2026-07-06:

- Frontend dev server returned HTTP 200 at `http://127.0.0.1:3000`.

## Manual Test Record

### 2026-07-07

Current confirmed status:

- The end-to-end ingest path has been validated:
  - PDF parse succeeded.
  - MiniMax embedding returned 1536-dimensional vectors.
  - Supabase `paper_chunks` insert succeeded.
  - Test paper id `0e6f3d04-0766-45da-af71-686a217e307d` has 244 chunks.
- The backend RAG answer path has been validated:
  - `POST /api/chat` returned an answer.
  - Sources include `content`, `page_number`, and `bbox`.
  - Sources currently have `paper_id: null`.
- Frontend fix completed:
  - Mixed normal-chat and RAG-chat messages now render in chronological order.
- RAG model routing completed:
  - MiniMax remains for embeddings.
  - Final RAG answer generation now uses the user's OpenAI-compatible chat API settings from the frontend.

Recommended next manual frontend test:

1. Open `http://127.0.0.1:3000`.
2. Refresh the page to load the latest frontend code.
3. Open the processed test paper.
4. Ask a normal model identity question with no selected paper, then ask a paper question with the paper selected.
5. Confirm message order is chronological.
6. Confirm RAG answer no longer identifies itself as MiniMax when user settings point to GPT-compatible model.
7. Confirm citation markers render and clicking them highlights the PDF.

Recommended next code task:

- Apply `supabase/migrations/202607070001_match_paper_chunks_returns_paper_id.sql` in Supabase so `match_paper_chunks` returns `paper_id`, then verify multi-paper citation targeting.

Code status:

- Added a local SQL migration for `match_paper_chunks` that returns `paper_id`.
- Added a backend single-paper fallback: if an older RPC still omits `paper_id` and only one paper was queried, `/api/chat` fills `sources.paper_id` from the request.
- Multi-paper citation targeting still requires applying the Supabase migration.

### 2026-07-06

Observed by user:

- Login succeeded.
- PDF upload succeeded in frontend.
- Supabase Storage bucket `PaperUWant_PDFS` received a new file:
  - `1783325745322-5dnupni.pdf`
  - MIME type: `application/pdf`
  - Size: `16.08 MB`
  - Added at: `2026/7/6 16:15:48`

Next checks:

- Confirm matching row in `papers`.
- Confirm generated rows in `paper_chunks`.
- Ask a paper-related question in frontend and verify citations.

Additional findings:

- `papers` row was confirmed by user.
- `paper_chunks` had no rows for the uploaded `paper_id`.
- Manual call to `POST /api/process_paper` returned PDF parse output successfully:
  - `total_blocks`: 244
  - `total_pages`: 11
- Direct MiniMax embedding test reached the MiniMax API and returned:
  - HTTP status: 200
  - API body contained `vectors: null`
  - `base_resp.status_code`: `1008`
  - `base_resp.status_msg`: `insufficient balance`

Conclusion:

- Current processing stops before chunk insert because embeddings are not produced.
- The immediate external blocker is MiniMax account balance or quota.
- The backend should also be improved so this condition returns a clear processing error instead of silently producing no `paper_chunks`.

Backend fix applied:

- `paper-backend/services/vector_store.py` now raises explicit `VectorStoreError` failures for:
  - Missing MiniMax credentials.
  - MiniMax HTTP/request errors.
  - MiniMax API errors such as insufficient balance.
  - Missing or malformed `vectors`.
  - Vector dimension mismatch against `vector(1536)`.
  - Supabase `paper_chunks` insert failures.
- `paper-backend/main.py` now returns a 502 response when vector storage fails.
- `POST /api/process_paper` now includes `stored_chunks` on success.

Verification after fix:

- Python compile/import checks passed.
- Direct MiniMax test now reports:
  - `MiniMax embedding API error 1008: insufficient balance`
- `POST /api/process_paper` now returns:
  - HTTP status: `502`
  - detail: `Vector store failed: MiniMax embedding API error 1008: insufficient balance`

After MiniMax balance was restored:

- Direct MiniMax embedding test returned:
  - `count`: 1
  - `dim`: 1536
- Manual `POST /api/process_paper` with the test PDF returned:
  - HTTP status: `200`
  - `total_blocks`: 244
  - `total_pages`: 11
  - `stored_chunks`: 244
- Supabase `paper_chunks` query for paper id `0e6f3d04-0766-45da-af71-686a217e307d` returned:
  - `count`: 244

RAG backend test:

- Manual `POST /api/chat` with paper id `0e6f3d04-0766-45da-af71-686a217e307d` returned an answer.
- The response included 5 source snippets with `page_number` and `bbox`.
- Observed issue: each source had `paper_id: null`.
- This means same-paper citation highlighting may still work through frontend fallback to `currentPaper`, but cross-paper citation targeting will be unreliable until the RPC or backend response includes `paper_id`.

Frontend chat ordering bug:

- Observed issue: when normal AI SDK chat messages and RAG messages were mixed, later RAG messages appeared above earlier normal chat messages.
- Root cause: rendering used `[...ragMessages, ...messages]`, so every RAG message was always displayed before every normal AI SDK message.
- Fix applied: frontend now assigns a monotonic display order to both RAG and normal AI SDK messages, then sorts the merged list by that order before rendering.
- Verification: `npx.cmd tsc --noEmit` passed after the change.

RAG answer model routing:

- Previous behavior: when any context paper was selected, questions were sent to `paper-backend` and final answers were generated by the hardcoded MiniMax chat model.
- New behavior: MiniMax is still used for embeddings, but final RAG answers are generated through the user's OpenAI-compatible settings from the frontend.
- The frontend now sends `api_key`, `base_url`, and `model_name` to `POST /api/chat`.
- The backend returns a clear 502 error if a RAG answer is requested without a chat API key.
- Verification:
  - `paper-backend` Python compile/import checks passed.
  - `frontend` `npx.cmd tsc --noEmit` passed.
  - Missing-key RAG request returned `Chat API key is required for RAG answers`.

## Current Lint Status

Command:

```powershell
cd D:\PaperUWant\frontend
npm.cmd run lint
```

Result on 2026-07-06:

- Failed with existing lint errors.
- Main categories:
  - `@typescript-eslint/no-explicit-any`
  - `@typescript-eslint/ban-ts-comment`
  - React hook dependency warnings
  - React compiler lint rules around synchronous state updates inside effects
  - React refs lint rule in `SelectionToolbar`

This does not block local manual runtime testing, but it should be cleaned before production builds or CI gating.

## Manual Upload-To-RAG Test

Prerequisites:

- Supabase project is active.
- `frontend/.env.local` has only public frontend Supabase variables.
- `paper-backend/.env` has server-side Supabase secret key and MiniMax variables.
- `paper-backend` is running at `http://localhost:8001`.
- Frontend is running at `http://localhost:3000`.

Steps:

1. Open `http://localhost:3000`.
2. Sign in with a Supabase user.
3. Upload a small text-based PDF.
4. Confirm the frontend shows upload success.
5. In Supabase Table Editor, check `papers`:
   - A new row should appear.
   - `file_name` should match the uploaded file.
   - `storage_path` should look like `{user_id}/{safe_file_name}.pdf`.
6. In Supabase Storage, check bucket `PaperUWant_PDFS`:
   - The uploaded file should exist under the user's folder.
7. Wait for backend processing to finish.
8. In Supabase Table Editor, check `paper_chunks`:
   - New rows should appear for the uploaded `paper_id`.
   - `content` should contain PDF text.
   - `metadata` should contain `page_number` and `bbox`.
   - `embedding` should be populated.
9. Open the uploaded PDF in the frontend.
10. Ask a paper-related question in the right-side AI panel.
11. Expected behavior:
   - The answer returns.
   - The answer contains citation markers such as `[1]`.
   - Clicking a citation highlights the source area in the PDF.

## If The Test Fails

### Upload Fails

Check:

- Supabase project status.
- Storage bucket `PaperUWant_PDFS`.
- Storage policies.
- `frontend/.env.local`.
- Browser console.

### `papers` Row Is Missing

Check:

- `papers` table policies.
- Auth session in frontend.
- Browser console errors from Supabase insert.

### `paper_chunks` Rows Are Missing

Check:

- `paper-backend` terminal logs.
- `paper-backend/.env` variables:
  - `SUPABASE_URL`
  - `SUPABASE_KEY`
  - `MINIMAX_API_KEY`
  - `MINIMAX_GROUP_ID`
- MiniMax embedding response.
- Whether embedding length is 1536.
- Whether Supabase insert into `paper_chunks` fails.

### RAG Answer Has No Sources

Check:

- `match_paper_chunks` exists.
- `paper_chunks` has rows for the selected `paper_id`.
- Query embedding succeeded.
- Function parameters match code:
  - `query_embedding`
  - `match_threshold`
  - `match_count`
  - `p_paper_ids`

### Citation Click Does Not Highlight Correctly

Check:

- Source metadata includes `page_number`.
- Source metadata includes `bbox`.
- PDF coordinate conversion in `frontend/src/components/PdfViewer.tsx`.

## Recommended Next Engineering Tasks

1. Run the manual upload-to-RAG test with one small PDF.
2. Record actual observed results in this file.
3. Fix any backend processing error first.
4. Add processing status fields to `papers`.
5. Update frontend to show processing state.
6. Clean frontend lint errors after the core chain is confirmed.
