/**
 * Frontend → FastAPI backend client.
 * Calls the PDF spatial parsing endpoint.
 */

const FASTAPI_BASE = "http://localhost:8001";

export interface BBoxBlock {
  text: string;
  page_number: number;
  bbox: [number, number, number, number];
}

export interface ParsePdfResult {
  total_blocks: number;
  total_pages: number;
  blocks: BBoxBlock[];
}

/**
 * Upload a PDF File to the FastAPI parser and get back
 * structured text blocks with bounding-box coordinates.
 *
 * @param file    — a browser File object (PDF)
 * @param paperId — UUID of the paper record (for vector-store linkage)
 * @returns       — parsed result or throws
 */
export async function parsePdfWithAI(file: File, paperId: string): Promise<ParsePdfResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("paper_id", paperId);

  const res = await fetch(`${FASTAPI_BASE}/api/process_paper`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`FastAPI /process_paper failed (${res.status}): ${detail}`);
  }

  return res.json() as Promise<ParsePdfResult>;
}

export interface ChatSource {
  content: string;
  paper_id?: string;
  metadata: {
    page_number: number;
    bbox: [number, number, number, number];
  };
}

export interface ChatResult {
  answer: string;
  sources: ChatSource[];
}

/**
 * Call the FastAPI RAG chat endpoint.
 *
 * @param paperIds  — UUIDs of papers to search within
 * @param query     — user's question
 * @param topK      — number of chunks to retrieve (default 5)
 */
export async function chatWithRag(
  paperIds: string[],
  query: string,
  topK = 5,
): Promise<ChatResult> {
  const res = await fetch(`${FASTAPI_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paper_ids: paperIds, query, top_k: topK }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`FastAPI /api/chat failed (${res.status}): ${detail}`);
  }

  return res.json() as Promise<ChatResult>;
}
