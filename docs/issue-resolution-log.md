# PaperUWant Issue Resolution Log

Last updated: 2026-07-07

This document records concrete issues debugged and fixed during the current PaperUWant development session.

## RAG Sources Missing `paper_id`

Symptom:

- RAG answers returned sources with `content`, `page_number`, and `bbox`, but `sources.paper_id` was `null`.
- Same-paper citation highlighting could still work through frontend fallback, but multi-paper citation targeting was unreliable.

Root cause:

- Supabase RPC `match_paper_chunks` did not include `paper_id` in its returned table.

Fix:

- Added `supabase/migrations/202607070001_match_paper_chunks_returns_paper_id.sql`.
- Added backend fallback for single-paper RAG: if the RPC result omits `paper_id` and the request contains exactly one paper, the backend fills `sources.paper_id` from the request.

Verification:

- Backend Python compile check passed.
- Frontend TypeScript check passed.

Follow-up observation on 2026-07-07:

- User selected OpenGS and Open3DIS together.
- The currently open PDF was Open3DIS.
- The user then asked a question specifically about OpenGS.
- The answer returned citation badges, but clicking a citation opened/highlighted Open3DIS instead of OpenGS.

Current diagnosis:

- This is the same source identity problem appearing in real multi-paper use.
- `frontend/src/app/page.tsx` currently handles citation clicks with:
  - `src.paper_id ?? currentPaper.id`
- That fallback is acceptable only for single-paper chat.
- In multi-paper chat, if `src.paper_id` is missing, the frontend cannot know which PDF should be opened.
- Because the current PDF was Open3DIS, missing-paper citations were routed to Open3DIS even when the answer text was about OpenGS.

Required next fix:

1. Apply or verify `supabase/migrations/202607070001_match_paper_chunks_returns_paper_id.sql` in the live Supabase project.
2. Confirm `/api/chat` response `sources` contains non-null `paper_id` for every source in multi-paper questions.
3. Add a frontend guard: when multiple context papers are selected and a citation has no `paper_id`, do not fall back to `currentPaper`; show a clear diagnostic instead.
4. Add a backend diagnostic log that reports how many returned sources are missing `paper_id`.

Expected result:

- Clicking an OpenGS citation should switch the PDF viewer to OpenGS, wait for the signed URL to load, scroll to the cited page, and show the blue bbox highlight.
- Clicking an Open3DIS citation should switch back to Open3DIS and highlight its cited bbox.
- Multi-paper citation behavior should not depend on whichever PDF happened to be open before the click.

## RAG Answer Used Empty Context

Symptom:

- With a selected paper, asking which dataset the paper used returned an answer based on `No relevant context retrieved`.

Root cause:

- The selected paper had zero rows in `paper_chunks`, so retrieval returned no context.
- The backend previously passed empty context to the chat model instead of surfacing a clear retrieval state.

Fix:

- Added `has_stored_chunks()` in `paper-backend/services/chat_service.py`.
- Updated `/api/chat` to return:
  - `409` when selected papers have no stored chunks.
  - `404` when chunks exist but no relevant chunks match the question.
- Updated frontend API error parsing to display FastAPI `detail` cleanly.

Verification:

- A paper with chunks retrieved 12 contexts.
- A paper with zero chunks returned a clear `409` diagnostic.

## Open3DIS Processing Failure

Symptom:

- Open3DIS appeared in the library and could be selected, but RAG returned the no-chunks diagnostic.

Root cause:

- PDF parsing extracted text containing `\u0000`.
- Supabase rejected inserts into `paper_chunks.content` with `unsupported Unicode escape sequence`.

Fix:

- Added `_clean_pdf_text()` in `paper-backend/services/pdf_parser.py`.
- The cleaner removes PostgreSQL-incompatible control characters while preserving normal whitespace.
- Reprocessed the latest Open3DIS paper from Supabase Storage.

Verification:

- Latest Open3DIS paper id `94ba3cd4-a872-4885-8d05-41ac739d5037` now has 465 stored chunks.
- The dataset question retrieves 12 contexts.

## PDF Viewer Loading State

Symptom:

- PDF visualization could get stuck at loading.

Root cause:

- PDF.js worker was loaded from `unpkg.com`, which can fail due to network or worker path issues.
- PDF viewer did not fully reset document state when the URL changed.

Fix:

- Changed `PdfViewer` to use the local bundled `pdfjs-dist/build/pdf.worker.min.mjs` worker.
- Reset `numPages`, `pageSizes`, `error`, and `loading` when the PDF URL changes.

Verification:

- Frontend TypeScript check passed.
- Frontend dev server restarted and returned HTTP 200.

## Re-clicking Current Paper Cleared PDF View

Symptom:

- After page refresh, the PDF viewer defaulted to the first paper.
- The chat context did not select that paper until the user clicked it.
- Clicking the already visible paper added it to chat context, but the PDF viewer changed to `No PDF file loaded`.

Root cause:

- Cloud papers loaded from `papers` have `pdf_url: ""`.
- Re-clicking the same paper called `setCurrentPaper(paper)`, which replaced the valid `currentPdfUrl` with the selected paper's empty `pdf_url`.
- The signed URL rehydration effect only depended on `currentPaper.id`, so clicking the same paper did not trigger URL recovery.

Fix:

- Updated `setCurrentPaper` to preserve the existing `currentPdfUrl` when the user re-selects the currently open paper.
- Updated the rehydration effect to run when `currentPdfUrl` is missing, using `currentPaper.id`, `currentPaper.storage_path`, and `currentPdfUrl` dependencies.

Verification:

- Frontend TypeScript check passed.
